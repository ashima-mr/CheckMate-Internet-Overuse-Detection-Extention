/**
 * Enhanced Background Service Worker for Internet Overuse Detection
 * Implements Hoeffding Tree with user feedback and privacy controls
 */

// Import required modules using proper importScripts for Manifest V3
importScripts(
    '../utils/circular-buffer.js',
    '../ml/adwin.js',
    '../ml/hoeffding-tree.js',
    '../ml/feature-engineer.js',
    '../ml/spc.js'
);

class OveruseDetectionService {
    constructor(settings) {
        this.isInitialized = false;
        this.settings = settings;

        this.featureEngineer = new FeatureEngineer();
        this.hoeffdingTree  = new HoeffdingTree({
            gracePeriod: 200,
            hoeffdingBound: this.settings.sensitivity ?? 0.5,
            driftDetectionMethod: 'ADWIN'
        });
        this.spcModel = new StatisticalProcessControl(100, 3);

        this.userFeedbackQueue = [];
        this.predictionHistory = [];

        this.lastNotificationTime = 0;
        this.notificationCooldown = 30 * 60 * 1000; // 30 minutes
        this.monitoringInterval = null;
        this.isPaused = false;
    }

    static async create() {
        const settings = await OveruseDetectionService.loadSettingsFromStorage();
        const service = new OveruseDetectionService(settings);
        await service.initialize();  // Sets up listeners, starts monitoring
        return service;
    }

    static async loadSettingsFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'enabled',
                'sensitivity',
                'notificationsEnabled',
                'monitoringInterval',
                'privacyMode',
                'dataRetentionDays'
            ], (result) => {
                resolve({
                    enabled: result.enabled ?? true,
                    sensitivity: result.sensitivity ?? 0.5,
                    notificationsEnabled: result.notificationsEnabled ?? true,
                    monitoringInterval: result.monitoringInterval ?? 15000,
                    privacyMode: result.privacyMode ?? false,
                    dataRetentionDays: result.dataRetentionDays ?? 30
                });
            });
        });
    }

    async initialize() {
        try {
            this.setupEventListeners();
            if (this.settings.enabled && !this.isPaused) {
                this.startMonitoring();
            }
            this.isInitialized = true;
            console.log('✅ Overuse Detection Service initialized successfully');
        } catch (error) {
            console.error('❌ Service initialization failed:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Set up Chrome API event listeners with proper error handling
     */
    setupEventListeners() {
        // Tab activation events
        chrome.tabs.onActivated.addListener((activeInfo) => {
            if (!this.isPaused) {
                this.handleTabActivated(activeInfo);
            }
        });

        // Tab update events  
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (!this.isPaused) {
                this.handleTabUpdated(tabId, changeInfo, tab);
            }
        });

        // Window focus events
        chrome.windows.onFocusChanged.addListener((windowId) => {
            if (!this.isPaused) {
                this.handleWindowFocusChanged(windowId);
            }
        });

        // Idle detection events
        chrome.idle.onStateChanged.addListener((state) => {
            if (!this.isPaused) {
                this.handleIdleStateChanged(state);
            }
        });

        // Extension install/startup events
        chrome.runtime.onInstalled.addListener(() => {
            this.handleExtensionInstalled();
        });

        chrome.runtime.onStartup.addListener(() => {
            this.handleExtensionStartup();
        });

        // Enhanced message passing with all required handlers
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    /**
     * Handle tab activation with proper error handling
     */
    async handleTabActivated(activeInfo) {
        if (!this.isInitialized || !this.settings.enabled || this.isPaused) return;
        
        try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            const event = {
                type: 'tab_activated',
                tabId: activeInfo.tabId,
                url: tab.url,
                title: tab.title,
                timestamp: Date.now()
            };

            this.featureEngineer.processEvent(event);
            await this.processMLPrediction();
            
        } catch (error) {
            console.warn('Tab activation handling error:', error);
        }
    }

    /**
     * Handle tab updates
     */
    async handleTabUpdated(tabId, changeInfo, tab) {
        if (!this.isInitialized || !this.settings.enabled || this.isPaused) return;
        if (!changeInfo.url && !changeInfo.status) return;

        try {
            const event = {
                type: 'tab_updated',
                tabId,
                changeInfo,
                url: tab.url,
                title: tab.title,
                timestamp: Date.now()
            };

            this.featureEngineer.processEvent(event);
            
        } catch (error) {
            console.warn('Tab update handling error:', error);
        }
    }

    /**
     * Handle window focus changes
     */
    handleWindowFocusChanged(windowId) {
        if (!this.isInitialized || !this.settings.enabled || this.isPaused) return;

        const event = {
            type: 'focus_change',
            windowId,
            focused: windowId !== chrome.windows.WINDOW_ID_NONE,
            timestamp: Date.now()
        };

        this.featureEngineer.processEvent(event);
    }

    /**
     * Handle idle state changes
     */
    handleIdleStateChanged(state) {
        if (!this.isInitialized || !this.settings.enabled || this.isPaused) return;

        const event = {
            type: 'idle_state',
            state,
            timestamp: Date.now()
        };

        this.featureEngineer.processEvent(event);
    }

    /**
     * Enhanced message handling with all required actions
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'getStats':
                    sendResponse(await this.getSystemStats());
                    break;
                    
                case 'updateSettings':
                    await this.updateSettings(message.settings);
                    sendResponse({ success: true });
                    break;
                    
                case 'resetSystem':
                    await this.resetSystem();
                    sendResponse({ success: true });
                    break;
                    
                case 'pauseTracking':
                    this.pauseTracking();
                    sendResponse({ success: true, paused: true });
                    break;
                    
                case 'resumeTracking':
                    this.resumeTracking();
                    sendResponse({ success: true, paused: false });
                    break;
                    
                case 'deleteAllData':
                    await this.deleteAllData();
                    sendResponse({ success: true });
                    break;
                    
                case 'submitFeedback':
                    await this.processFeedback(message.feedback);
                    sendResponse({ success: true });
                    break;
                    
                case 'getVisualizationData':
                    sendResponse(await this.getVisualizationData());
                    break;
                    
                case 'testNotification':
                    await this.showTestNotification();
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown action: ' + message.action });
            }
        } catch (error) {
            console.error('Message handling error:', error);
            sendResponse({ error: error.message });
        }
    }

    /**
     * Process ML prediction using Hoeffding Tree
     */
    async processMLPrediction() {
        try {
            const features = this.featureEngineer.extractFeatures();
            const prediction = this.hoeffdingTree.predict(features);
            
            // Store prediction result with enhanced metadata
            const predictionData = {
                ...prediction,
                features: features,
                timestamp: Date.now(),
                sessionStats: this.featureEngineer.getSessionStats()
            };
            
            await this.storePredictionResult(predictionData);
            
            // Check if notification should be triggered
            if (prediction.prediction === 1 && this.shouldTriggerNotification(prediction)) {
                await this.showOveruseNotification(prediction);
            }
            
        } catch (error) {
            console.warn('ML prediction error:', error);
        }
    }

    /** Process feedback for model update */
    async processFeedback(feedback) {
        try {
            const recent = await this.getRecentPredictions();
            const target = recent.find(p => Math.abs(p.timestamp - feedback.timestamp) < 60000);
            if (!target) return;

            const classMap = ['productive', 'non-productive', 'overuse'];
            const corrected = classMap.indexOf(feedback.trueClass);
            if (corrected === -1) {
            console.warn('⚠️ Invalid class label in feedback:', feedback.trueClass);
            return;
            }

            const updateResult = this.hoeffdingTree.update(
            target.features,
            corrected,
            {
                correctedClass: corrected,
                confidence: feedback.confidence || 1.0,
                reasoning: feedback.reasoning || 'User-provided label'
            }
            );

            await this.logUserFeedback({
            ...feedback,
            predictionId: target.timestamp,
            modelResponse: updateResult
            });

            console.log('✅ User feedback processed:', updateResult);

        } catch (e) {
            console.error('❌ Feedback processing error:', e);
        }
    }

    async updateSettings(newSettings) {
        try {
            // Merge new settings into current configuration
            this.settings = { ...this.settings, ...newSettings };
            // Persist to storage
            await chrome.storage.local.set(this.settings);
            // Apply runtime changes
            if ('enabled' in newSettings) {
                if (newSettings.enabled && this.isPaused) {
                    this.resumeTracking();
                } else if (!newSettings.enabled && !this.isPaused) {
                    this.pauseTracking();
                }
            }
            if ('sensitivity' in newSettings && this.hoeffdingTree) {
                this.hoeffdingTree.hoeffdingBound = newSettings.sensitivity;
            }
            if ('notificationsEnabled' in newSettings) {
                // No special runtime action needed
            }
            console.log('Settings updated successfully');
        } catch (err) {
            console.error('Failed to update settings', err);
            throw err;
        }
    }

    /**
     * Privacy controls - pause tracking
     */
    pauseTracking() {
        this.isPaused = true;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        console.log('Tracking paused by user');
    }

    /**
     * Privacy controls - resume tracking  
     */
    resumeTracking() {
        this.isPaused = false;
        if (this.settings.enabled) {
            this.startMonitoring();
        }
        console.log('Tracking resumed by user');
    }

    /**
     * Privacy controls - delete all user data
     */
    async deleteAllData() {
        try {
            // Clear all stored data
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            
            // Clear browsing data if permission granted
            if (chrome.browsingData) {
                await chrome.browsingData.remove({
                    since: 0
                }, {
                    cache: true,
                    cookies: true,
                    history: true,
                    localStorage: true
                });
            }
            
            // Reset ML models
            this.hoeffdingTree.reset();
            this.spcModel.reset();
            this.featureEngineer.resetSession();
            
            console.log('All user data deleted');
            
        } catch (error) {
            console.error('Data deletion error:', error);
            throw error;
        }
    }

    /**
     * Get comprehensive system statistics
     */
    async getSystemStats() {
        try {
            const stats = {
                isInitialized: this.isInitialized,
                isPaused: this.isPaused,
                settings: this.settings,
                sessionStats: this.featureEngineer ? this.featureEngineer.getSessionStats() : null,
                mlStats: this.hoeffdingTree ? this.hoeffdingTree.getStats() : null,
                spcStats: this.spcModel ? this.spcModel.getStatistics() : null,
                lastNotification: this.lastNotificationTime,
                uptime: Date.now() - (this.startTime || Date.now()),
                feedbackCount: this.userFeedbackQueue.length
            };

            // Get recent predictions
            const recentPredictions = await this.getRecentPredictions();
            stats.recentPredictions = recentPredictions.slice(-10);
            
            return stats;
            
        } catch (error) {
            console.error('Stats error:', error);
            return { error: error.message };
        }
    }

    /**
     * Get data for visualization dashboard
     */
    async getVisualizationData() {
        try {
            const recentPredictions = await this.getRecentPredictions();
            const sessionStats = this.featureEngineer.getSessionStats();
            const spcData = this.spcModel.getStatistics();
            
            return {
                predictions: recentPredictions,
                sessionStats: sessionStats,
                spcData: spcData,
                treeStats: this.hoeffdingTree.getStats(),
                feedbackHistory: this.userFeedbackQueue.slice(-50)
            };
            
        } catch (error) {
            console.error('Visualization data error:', error);
            return { error: error.message };
        }
    }

    // Storage and utility methods...
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['settings']);
            if (result.settings) {
                this.settings = { ...this.settings, ...result.settings };
            }
        } catch (error) {
            console.warn('Settings load error:', error);
        }
    }

    async storePredictionResult(prediction) {
        try {
            const result = await chrome.storage.local.get(['predictions']);
            const predictions = result.predictions || [];
            predictions.push({
                timestamp: Date.now(),
                ...prediction
            });

            // Keep only last 100 predictions
            if (predictions.length > 100) {
                predictions.splice(0, predictions.length - 100);
            }

            await chrome.storage.local.set({ predictions });
        } catch (error) {
            console.warn('Prediction storage error:', error);
        }
    }

    async getRecentPredictions() {
        try {
            const result = await chrome.storage.local.get(['predictions']);
            return result.predictions || [];
        } catch (error) {
            console.warn('Prediction retrieval error:', error);
            return [];
        }
    }

    startMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(() => {
            if (this.isInitialized && this.settings.enabled && !this.isPaused) {
                this.performPeriodicCheck();
            }
        }, this.settings.monitoringInterval);
    }

    async performPeriodicCheck() {
        try {
            await this.processMLPrediction();
            await this.updateStorageData();
        } catch (error) {
            console.warn('Periodic check error:', error);
        }
    }

    shouldTriggerNotification(prediction) {
        if (!this.settings.notificationsEnabled) return false;
        
        const now = Date.now();
        const timeSinceLastNotification = now - this.lastNotificationTime;
        
        // Respect cooldown period
        if (timeSinceLastNotification < this.notificationCooldown) return false;
        
        // High confidence threshold for notifications
        return prediction.confidence > 0.7;
    }

    async showOveruseNotification(prediction) {
        try {
            const notificationOptions = {
                type: 'basic',
                iconUrl: '../assets/icons/icon48.png',
                title: 'Internet Overuse Detected',
                message: `Unhealthy usage pattern detected (confidence: ${Math.round(prediction.confidence * 100)}%). Consider taking a break.`,
                buttons: [
                    { title: 'Not Overuse' },
                    { title: 'Confirm & Take Break' }
                ]
            };

            chrome.notifications.create('overuse-alert', notificationOptions);
            this.lastNotificationTime = Date.now();

            // Handle notification button clicks for feedback
            chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
                if (notificationId === 'overuse-alert') {
                    this.handleNotificationFeedback(buttonIndex, prediction);
                    chrome.notifications.clear(notificationId);
                }
            });

        } catch (error) {
            console.error('Notification error:', error);
        }
    }

    async handleNotificationFeedback(buttonIndex, prediction) {
        const isOveruse = buttonIndex === 1;

        // Assign trueClass with distribution for non-overuse feedback
        const trueClass = isOveruse
            ? 'overuse'
            : Math.random() < 0.5
            ? 'productive'
            : 'non-productive';

        const feedback = {
            timestamp: prediction.timestamp || Date.now(), // Prefer prediction time, fallback to now
            trueClass,
            confidence: 1.0,
            reasoning: isOveruse
            ? 'User confirmed overuse'
            : 'User indicated not overuse',
            isCorrect: isOveruse // Optional, only if you want to keep it
        };

        await this.processFeedback(feedback);

        if (isOveruse) {
            chrome.tabs.create({
            url: chrome.runtime.getURL('src/popup/break-timer.html'),
            active: true
            });
        }
        }

    async logUserFeedback(feedback) {
        try {
            const result = await chrome.storage.local.get(['userFeedback']);
            const feedbackHistory = result.userFeedback || [];
            feedbackHistory.push(feedback);
            
            // Keep last 100 feedback entries
            if (feedbackHistory.length > 100) {
                feedbackHistory.shift();
            }
            
            await chrome.storage.local.set({ userFeedback: feedbackHistory });
        } catch (error) {
            console.warn('Feedback logging error:', error);
        }
    }

    async updateStorageData() {
        const sessionData = {
            lastUpdate: Date.now(),
            isActive: this.settings.enabled && !this.isPaused,
            featureStats: this.featureEngineer ? this.featureEngineer.getSessionStats() : null
        };
        
        await chrome.storage.local.set({ sessionData });
    }
}
OveruseDetectionService.create().then(service => {
    // Optionally store service in a global variable if needed
    // Set up any additional event listeners or keep-alive logic here

    chrome.runtime.onConnect.addListener((port) => {
        // Keep service worker alive logic here
    });

    console.log('🚀 Internet Overuse Detection Service Worker loaded');
});
