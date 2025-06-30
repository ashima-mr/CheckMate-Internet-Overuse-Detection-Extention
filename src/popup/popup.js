/**
 * Enhanced Popup Controller with comprehensive UI responsiveness metrics
 * MODIFIED: Added UI performance tracking and research metrics collection
 */

class PopupController {
    constructor() {
        this.isInitialized = false;
        this.updateInterval = null;
        this.currentPrediction = null;
        this.isPaused = false;

        // ADDED: UI responsiveness and performance metrics
        this.uiMetrics = {
            // UI responsiveness tracking
            responsiveness: {
                renderTimes: [],
                updateTimes: [],
                interactionLatencies: []
            },
            
            // User interaction tracking
            userInteractions: {
                buttonClicks: {},
                settingsChanges: {},
                feedbackSubmissions: []
            },
            
            // Display update metrics
            displayUpdates: {
                statsUpdates: 0,
                mlInsightUpdates: 0,
                usageLevelUpdates: 0,
                statusUpdates: 0,
                averageUpdateTime: 0
            },
            
            // Performance tracking
            performance: {
                initializationTime: 0,
                averageRenderTime: 0,
                memoryUsage: [],
                domUpdates: []
            }
        };

        this.init();
    }

    /**
     * Enhanced initialization with performance tracking
     * MODIFIED: Added comprehensive initialization metrics
     */
    async init() {
        const initStartTime = performance.now();
        
        try {
            this.setupEventListeners();
            await this.loadCurrentSettings();
            this.startPeriodicUpdates();
            this.isInitialized = true;
            
            // ADDED: Record initialization time
            this.uiMetrics.performance.initializationTime = performance.now() - initStartTime;
            
            console.log('Popup controller initialized');
        } catch (error) {
            console.error('Popup initialization error:', error);
            this.showError('Failed to initialize extension');
        }
    }

    /**
     * Enhanced event listeners with interaction tracking
     * MODIFIED: Added comprehensive user interaction metrics
     */
    setupEventListeners() {
        // Settings controls with interaction tracking
        const enableMonitoring = document.getElementById('enableMonitoring');
        const enableNotifications = document.getElementById('enableNotifications');
        const sensitivitySlider = document.getElementById('sensitivitySlider');

        if (enableMonitoring) {
            enableMonitoring.addEventListener('change', e => {
                const interactionStartTime = performance.now();
                
                // ADDED: Track settings changes
                this.uiMetrics.userInteractions.settingsChanges.enableMonitoring = 
                    (this.uiMetrics.userInteractions.settingsChanges.enableMonitoring || 0) + 1;
                
                this.updateSetting('enabled', e.target.checked);
                
                // ADDED: Track interaction latency
                const latency = performance.now() - interactionStartTime;
                this.uiMetrics.responsiveness.interactionLatencies.push({
                    type: 'enableMonitoring',
                    latency: latency,
                    timestamp: Date.now()
                });
            });
        }

        if (enableNotifications) {
            enableNotifications.addEventListener('change', e => {
                const interactionStartTime = performance.now();
                
                this.uiMetrics.userInteractions.settingsChanges.enableNotifications = 
                    (this.uiMetrics.userInteractions.settingsChanges.enableNotifications || 0) + 1;
                
                this.updateSetting('notificationsEnabled', e.target.checked);
                
                const latency = performance.now() - interactionStartTime;
                this.uiMetrics.responsiveness.interactionLatencies.push({
                    type: 'enableNotifications',
                    latency: latency,
                    timestamp: Date.now()
                });
            });
        }

        if (sensitivitySlider) {
            sensitivitySlider.addEventListener('input', e => {
                const interactionStartTime = performance.now();
                
                this.uiMetrics.userInteractions.settingsChanges.sensitivitySlider = 
                    (this.uiMetrics.userInteractions.settingsChanges.sensitivitySlider || 0) + 1;
                
                this.updateSetting('sensitivity', parseFloat(e.target.value));
                
                const latency = performance.now() - interactionStartTime;
                this.uiMetrics.responsiveness.interactionLatencies.push({
                    type: 'sensitivitySlider',
                    latency: latency,
                    timestamp: Date.now()
                });
            });
        }

        // ADDED: Enhanced action buttons with click tracking
        const buttons = [
            { id: 'viewStatsBtn', handler: () => this.handleViewStats() },
            { id: 'manageWebsitesBtn', handler: () => this.handleManageWebsites() },
            { id: 'pauseBtn', handler: () => this.handlePauseToggle() },
            { id: 'takeBreakBtn', handler: () => this.handleTakeBreak() },
            { id: 'deleteDataBtn', handler: () => this.handleDeleteData() },
            { id: 'downloadDataBtn', handler: () => this.handleDownloadData() }
        ];

        buttons.forEach(({ id, handler }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', () => {
                    const clickStartTime = performance.now();
                    
                    // ADDED: Track button clicks
                    this.uiMetrics.userInteractions.buttonClicks[id] = 
                        (this.uiMetrics.userInteractions.buttonClicks[id] || 0) + 1;
                    
                    handler();
                    
                    // ADDED: Track click response time
                    const responseTime = performance.now() - clickStartTime;
                    this.uiMetrics.responsiveness.interactionLatencies.push({
                        type: `button_${id}`,
                        latency: responseTime,
                        timestamp: Date.now()
                    });
                });
            }
        });

        // ADDED: Enhanced feedback buttons with tracking
        const feedbackButtons = [
            { id: 'feedbackProductive', label: 'productive' },
            { id: 'feedbackNonproductive', label: 'non-productive' },
            { id: 'feedbackOveruse', label: 'overuse' }
        ];

        feedbackButtons.forEach(({ id, label }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', () => {
                    const feedbackStartTime = performance.now();
                    
                    // ADDED: Track feedback submissions
                    this.uiMetrics.userInteractions.feedbackSubmissions.push({
                        label: label,
                        timestamp: Date.now()
                    });
                    
                    this.submitFeedback(label);
                    
                    // ADDED: Track feedback response time
                    const responseTime = performance.now() - feedbackStartTime;
                    this.uiMetrics.responsiveness.interactionLatencies.push({
                        type: `feedback_${label}`,
                        latency: responseTime,
                        timestamp: Date.now()
                    });
                });
            }
        });

        const exportMetricsBtn = document.getElementById('exportMetricsBtn');
        if (exportMetricsBtn) {
            exportMetricsBtn.addEventListener('click', () => this.handleExportMetrics());
        }
    }

    /**
     * Enhanced stats update with performance tracking
     * MODIFIED: Added comprehensive display update metrics
     */
    async updateStats() {
        const updateStartTime = performance.now();
        try {
            const stats = await chrome.runtime.sendMessage({ action: 'getStats' });
            if (stats && !stats.error) {
                // ADDED: Track individual update components
                const sessionUpdateStart = performance.now();
                this.updateSessionDisplay(stats);
                const sessionUpdateTime = performance.now() - sessionUpdateStart;
                
                const mlUpdateStart = performance.now();
                this.updateMLInsights(stats);
                const mlUpdateTime = performance.now() - mlUpdateStart;
                
                const usageUpdateStart = performance.now();
                this.updateUsageLevel(stats);
                const usageUpdateTime = performance.now() - usageUpdateStart;
                
                const statusUpdateStart = performance.now();
                this.updateLastUpdate();
                this.updateStatusIndicator(stats);
                const statusUpdateTime = performance.now() - statusUpdateStart;
                
                // ADDED: Record component update times
                this.uiMetrics.displayUpdates.statsUpdates++;
                this.uiMetrics.displayUpdates.mlInsightUpdates++;
                this.uiMetrics.displayUpdates.usageLevelUpdates++;
                this.uiMetrics.displayUpdates.statusUpdates++;
                
                // ADDED: Track DOM update performance
                this.uiMetrics.performance.domUpdates.push({
                    timestamp: Date.now(),
                    sessionUpdate: sessionUpdateTime,
                    mlUpdate: mlUpdateTime,
                    usageUpdate: usageUpdateTime,
                    statusUpdate: statusUpdateTime,
                    totalUpdate: performance.now() - updateStartTime
                });
                
                // ADDED: Render recent predictions in the popup
                this.renderRecentPredictions(stats.recentPredictions || []);
                // Show feedback prompt if in bootstrap (grace period not reached)
                if (stats.mlStats && stats.mlStats.instancesSeen < (stats.mlStats.gracePeriod || 200)) {
                    this.showFeedbackSection(true);
                    this.showLog('Please provide feedback to help train the AI (bootstrap mode).');
                } else {
                    this.showFeedbackSection(false);
                }
            }

            // ADDED: Record total update time
            const totalUpdateTime = performance.now() - updateStartTime;
            this.uiMetrics.responsiveness.updateTimes.push({
                timestamp: Date.now(),
                updateTime: totalUpdateTime
            });
            
            // Calculate average update time
            const updateTimes = this.uiMetrics.responsiveness.updateTimes.map(u => u.updateTime);
            this.uiMetrics.displayUpdates.averageUpdateTime = this.calculateMean(updateTimes);

        } catch (error) {
            this.showConnectionError();
            this.showLog('Stats update error: ' + (error && error.message ? error.message : error));
        }
    }

    renderRecentPredictions(predictions) {
        const container = document.getElementById('recentPredictionsList');
        if (!container) return;
        container.innerHTML = '';
        if (!predictions.length) {
            container.innerHTML = '<div class="no-predictions">No predictions yet.</div>';
            return;
        }
        const classLabels = ['Productive', 'Non-Productive', 'Overuse'];
        const classColors = ['#48bb78', '#ed8936', '#e53e3e'];
        predictions.slice(-10).reverse().forEach(pred => {
            const div = document.createElement('div');
            div.className = 'recent-prediction-row';
            div.style = `display:flex;align-items:center;gap:8px;margin-bottom:4px;`;
            div.innerHTML = `
                <span style="font-weight:bold;color:${classColors[pred.prediction]}">${classLabels[pred.prediction] || 'Unknown'}</span>
                <span style="opacity:0.7;">${Math.round((pred.confidence || 0) * 100)}%</span>
                <span style="font-size:0.9em;color:#888;">${new Date(pred.timestamp).toLocaleTimeString()}</span>
            `;
            container.appendChild(div);
        });
    }

    /**
     * Enhanced session display update with render tracking
     * MODIFIED: Added render time tracking
     */
    updateSessionDisplay(stats) {
        const renderStartTime = performance.now();
        
        const sessionData = stats.sessionStats || {};
        
        const sessionDuration = document.getElementById('sessionDuration');
        const websiteCount = document.getElementById('websiteCount');
        const activityLevel = document.getElementById('activityLevel');
        
        if (sessionDuration) {
            sessionDuration.textContent = this.formatDuration(sessionData.sessionDuration || 0);
        }
        
        if (websiteCount) {
            websiteCount.textContent = sessionData.domains?.length || '0';
        }
        
        if (activityLevel) {
            const activityScore = this.calculateActivityLevel(sessionData);
            activityLevel.textContent = activityScore;
        }

        // ADDED: Record render time
        const renderTime = performance.now() - renderStartTime;
        this.uiMetrics.responsiveness.renderTimes.push({
            type: 'sessionDisplay',
            renderTime: renderTime,
            timestamp: Date.now()
        });
    }

    /**
     * Enhanced ML insights update with performance tracking
     * MODIFIED: Added ML display performance metrics
     */
    updateMLInsights(stats) {
        const renderStartTime = performance.now();
        
        const recentPredictions = stats.recentPredictions || [];
        const latestPrediction = recentPredictions[recentPredictions.length - 1];
        
        const patternScore = document.getElementById('patternScore');
        const confidenceScore = document.getElementById('confidenceScore');
        
        if (latestPrediction) {
            this.currentPrediction = latestPrediction;
            const patternScoreValue = Math.round((latestPrediction.prediction / 2) * 100);
            const confidence = Math.round((latestPrediction.confidence || 0) * 100);
            
            if (patternScore) patternScore.textContent = `${patternScoreValue}%`;
            if (confidenceScore) confidenceScore.textContent = `${confidence}%`;
            
            this.updateInsightColors(latestPrediction.prediction, confidence);
            this.showFeedbackSection();
        } else {
            if (patternScore) patternScore.textContent = '--';
            if (confidenceScore) confidenceScore.textContent = '--';
            this.hideFeedbackSection();
        }

        // ADDED: Record ML insights render time
        const renderTime = performance.now() - renderStartTime;
        this.uiMetrics.responsiveness.renderTimes.push({
            type: 'mlInsights',
            renderTime: renderTime,
            timestamp: Date.now()
        });
    }

    // ADDED: Get comprehensive UI metrics for research analysis
    getUIMetrics() {
        const currentTime = Date.now();
        
        return {
            // UI Responsiveness metrics
            responsiveness: {
                averageRenderTime: this.calculateMean(
                    this.uiMetrics.responsiveness.renderTimes.map(r => r.renderTime)
                ),
                averageUpdateTime: this.calculateMean(
                    this.uiMetrics.responsiveness.updateTimes.map(u => u.updateTime)
                ),
                averageInteractionLatency: this.calculateMean(
                    this.uiMetrics.responsiveness.interactionLatencies.map(i => i.latency)
                ),
                totalRenderOperations: this.uiMetrics.responsiveness.renderTimes.length,
                totalUpdateOperations: this.uiMetrics.responsiveness.updateTimes.length,
                totalInteractions: this.uiMetrics.responsiveness.interactionLatencies.length
            },
            
            // User interaction patterns
            userInteractions: {
                buttonClickDistribution: this.uiMetrics.userInteractions.buttonClicks,
                settingsChanges: this.uiMetrics.userInteractions.settingsChanges,
                feedbackSubmissions: {
                    total: this.uiMetrics.userInteractions.feedbackSubmissions.length,
                    distribution: this.calculateFeedbackDistribution()
                }
            },
            
            // Display performance
            displayPerformance: {
                ...this.uiMetrics.displayUpdates,
                domUpdatePerformance: {
                    averageSessionUpdate: this.calculateMean(
                        this.uiMetrics.performance.domUpdates.map(d => d.sessionUpdate)
                    ),
                    averageMLUpdate: this.calculateMean(
                        this.uiMetrics.performance.domUpdates.map(d => d.mlUpdate)
                    ),
                    averageUsageUpdate: this.calculateMean(
                        this.uiMetrics.performance.domUpdates.map(d => d.usageUpdate)
                    ),
                    averageStatusUpdate: this.calculateMean(
                        this.uiMetrics.performance.domUpdates.map(d => d.statusUpdate)
                    ),
                    averageTotalUpdate: this.calculateMean(
                        this.uiMetrics.performance.domUpdates.map(d => d.totalUpdate)
                    )
                }
            },
            
            // Overall performance summary
            performanceSummary: {
                initializationTime: this.uiMetrics.performance.initializationTime,
                responsive: this.calculateMean(
                    this.uiMetrics.responsiveness.interactionLatencies.map(i => i.latency)
                ) < 100, // Less than 100ms is considered responsive
                millisecondsLevel: true,
                uiHealthy: this.isUIHealthy()
            }
        };
    }

    // ADDED: Calculate feedback distribution
    calculateFeedbackDistribution() {
        const distribution = {};
        this.uiMetrics.userInteractions.feedbackSubmissions.forEach(feedback => {
            distribution[feedback.label] = (distribution[feedback.label] || 0) + 1;
        });
        return distribution;
    }

    // ADDED: Determine if UI is performing healthily
    isUIHealthy() {
        const avgInteractionLatency = this.calculateMean(
            this.uiMetrics.responsiveness.interactionLatencies.map(i => i.latency)
        );
        const avgRenderTime = this.calculateMean(
            this.uiMetrics.responsiveness.renderTimes.map(r => r.renderTime)
        );
        
        // UI is healthy if average latencies are under thresholds
        return avgInteractionLatency < 100 && avgRenderTime < 50;
    }

    // ADDED: Helper method to calculate mean
    calculateMean(values) {
        if (!values || values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }


    updateUsageLevel(stats) {
        const recentPredictions = stats.recentPredictions || [];
        if (recentPredictions.length === 0) {
            this.setUsageIndicator(0.33, 'Initializing...');
            return;
        }

        const classCount = [0, 0, 0]; // [productive, non-productive, overuse]
        recentPredictions.slice(-10).forEach(p => {
            if (p.prediction >= 0 && p.prediction <= 2) classCount[p.prediction]++;
        });

        const total = classCount.reduce((sum, c) => sum + c, 0);
        if (total === 0) {
            this.setUsageIndicator(0.33, 'No Data');
            return;
        }

        const healthScore = (classCount[0] * 1.0 + classCount[1] * 0.5 + classCount[2] * 0.0) / total;
        let label = healthScore >= 0.7 ? 'Healthy Usage' :
                   healthScore >= 0.4 ? 'Moderate Usage' :
                   'Concerning Usage';
        this.setUsageIndicator(1 - healthScore, label);
    }

    setUsageIndicator(fillRatio, label) {
        console.log('Updating usage indicator:', fillRatio, label);
        const usageFill = document.getElementById('usageFill');
        const usageLabel = document.getElementById('usageLabel');
        
        if (usageFill) {
            usageFill.style.width = `${fillRatio * 100}%`;
            usageFill.style.background = fillRatio < 0.3 ? '#48bb78' :
                                        fillRatio < 0.6 ? '#ed8936' : '#e53e3e';
        }
        
        if (usageLabel) {
            usageLabel.textContent = `Real-Time Usage Health Indicator`;
        }
    }

    updateStatusIndicator(stats) {
        // FIXED: Added null check
        const indicator = document.getElementById('statusIndicator');
        if (!indicator) return;

        const statusText = indicator.querySelector('.status-text');
        if (!statusText) return;

        if (this.isPaused) {
            statusText.textContent = 'Paused';
            indicator.className = 'status-indicator status-paused';
        } else if (stats.isInitialized) {
            statusText.textContent = 'Active';
            indicator.className = 'status-indicator';
        } else {
            statusText.textContent = 'Error';
            indicator.className = 'status-indicator status-error';
        }
    }

    showFeedbackSection(isPrompt = false) {
        const sec = document.getElementById('sessionFeedbackSection');
        const banner = document.getElementById('feedbackPromptBanner');
        if (sec) {
            sec.style.display = 'block';
            sec.classList.add('fade-in');
        }
        if (banner) {
            banner.style.display = isPrompt ? 'block' : 'none';
        }
    }

    hideFeedbackSection() {
        // Feedback section is always visible now, so do nothing
    }

    showLog(message) {
        const logArea = document.getElementById('popupLogArea');
        if (logArea) {
            logArea.style.display = 'block';
            logArea.textContent = message;
            setTimeout(() => { logArea.style.display = 'none'; }, 5000);
        }
        console.warn(message);
    }

    /** Submit the chosen ML class label as feedback - FIXED METHOD NAME */
    async submitFeedback(label) {
        try {
            const feedback = {
                timestamp: Date.now(),
                trueClass: label
            };
            await chrome.runtime.sendMessage({
                action: 'submitFeedback',
                feedback
            });
            this.hideFeedbackSection();
            this.showFeedbackThankYou(label);
        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showError('Failed to submit feedback');
        }
    }

    showFeedbackThankYou(label) {
        const insightsSection = document.querySelector('.insights-section');
        if (insightsSection) {
            const msg = document.createElement('div');
            msg.className = 'feedback-thankyou';
            msg.textContent = `Thank you! You marked this session as "${label}".`;
            insightsSection.appendChild(msg);
            setTimeout(() => msg.remove(), 3000);
        }
    }

    handleViewStats() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/stats.html'), active: true });
    }

    handleManageWebsites() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/options.html'), active: true });
    }

    async handlePauseToggle() {
        try {
            const action = this.isPaused ? 'resumeTracking' : 'pauseTracking';
            const resp = await chrome.runtime.sendMessage({ action });
            if (resp && resp.success) {
                this.isPaused = resp.paused;
                this.updatePauseButton();
                await this.updateStats();
            }
        } catch (error) {
            console.error('Pause toggle error:', error);
            this.showError('Failed to toggle tracking');
        }
    }

    updatePauseButton() {
        const btn = document.getElementById('pauseBtn');
        if (btn) {
            btn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
            btn.classList.toggle('btn-primary', this.isPaused);
            btn.classList.toggle('btn-secondary', !this.isPaused);
        }
    }

    handleTakeBreak() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/break-timer.html'), active: true });
    }

    async handleDeleteData() {
        if (!confirm('This will permanently delete all your usage data. Continue?')) return;
        try {
            await chrome.runtime.sendMessage({ action: 'deleteAllData' });
            this.showSuccess('All data deleted successfully');
            setTimeout(() => window.close(), 1500);
        } catch (error) {
            console.error('Data deletion error:', error);
            this.showError('Failed to delete data');
        }
    }

    handleDownloadData() {
        chrome.storage.local.get(null, allData => {
            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'checkmate_data.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }

    async handleExportMetrics() {
        try {
            const metrics = await chrome.runtime.sendMessage({ action: 'getResearchMetrics' });
            if (metrics && !metrics.error) {
                const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'checkmate_research_metrics.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                this.showLog('Research metrics exported successfully.');
            } else {
                this.showLog('Failed to export metrics: ' + (metrics && metrics.error ? metrics.error : 'Unknown error'));
            }
        } catch (error) {
            this.showLog('Export metrics error: ' + (error && error.message ? error.message : error));
        }
    }

    calculateActivityLevel(sessionStats) {
        const total = (sessionStats.scrollEvents||0) + (sessionStats.clickEvents||0) + (sessionStats.keystrokeEvents||0);
        const mins = Math.max((sessionStats.sessionDuration||0)/(1000*60),1);
        const rate = total/mins;
        return rate < 5 ? 'Low' : rate < 15 ? 'Med' : 'High';
    }

    updateUIFromSettings(settings) {
        const enableMonitoring = document.getElementById('enableMonitoring');
        const enableNotifications = document.getElementById('enableNotifications');
        const sensitivitySlider = document.getElementById('sensitivitySlider');

        if (enableMonitoring) enableMonitoring.checked = settings.enabled || false;
        if (enableNotifications) enableNotifications.checked = settings.notificationsEnabled || false;
        if (sensitivitySlider) sensitivitySlider.value = settings.sensitivity || 0.5;
    }

    async loadCurrentSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'enabled',
                'sensitivity',
                'notificationsEnabled',
                'monitoringInterval',
                'privacyMode',
                'dataRetentionDays'
            ], (result) => {
                this.updateUIFromSettings({
                    enabled: result.enabled ?? true,
                    sensitivity: result.sensitivity ?? 0.5,
                    notificationsEnabled: result.notificationsEnabled ?? true,
                    monitoringInterval: result.monitoringInterval ?? 15000,
                    privacyMode: result.privacyMode ?? false,
                    dataRetentionDays: result.dataRetentionDays ?? 30
                });
                resolve();
            });
        });
    }

    updateLastUpdate() {
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            lastUpdate.textContent = now;
        }
    }

    formatDuration(ms) {
        const h = Math.floor(ms/(1000*60*60));
        const m = Math.floor((ms%(1000*60*60))/(1000*60));
        return h>0 ? `${h}h ${m}m` : `${m}m`;
    }

    updateInsightColors(prediction, confidence) {
        // Add visual feedback based on prediction confidence
        const patternScore = document.getElementById('patternScore');
        const confidenceScore = document.getElementById('confidenceScore');
        
        if (patternScore) {
            patternScore.style.color = prediction === 2 ? '#e53e3e' : 
                                     prediction === 1 ? '#ed8936' : '#48bb78';
        }
        
        if (confidenceScore) {
            confidenceScore.style.opacity = confidence / 100;
        }
    }

    showError(message) { 
        console.error(message);
        // Show error in UI if possible
        const statusText = document.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = 'Error';
            statusText.style.color = '#e53e3e';
        }
    }

    showSuccess(message) { 
        console.log(message);
        // Show success in UI if possible
        const statusText = document.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = 'Success';
            statusText.style.color = '#48bb78';
            setTimeout(() => {
                statusText.textContent = 'Active';
                statusText.style.color = '';
            }, 2000);
        }
    }

    showConnectionError() {
        const ind = document.getElementById('statusIndicator');
        if (ind) {
            const statusText = ind.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = 'Connection Error';
            }
            ind.className = 'status-indicator status-error';
        }
   }

    // Periodic UI update for popup
    startPeriodicUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        // Update every 5 seconds (or as needed)
        this.updateInterval = setInterval(() => {
            this.updateStats();
        }, 5000);
        // Run one update immediately
        this.updateStats();
    }

    stopPeriodicUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

// Initialize popup controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});