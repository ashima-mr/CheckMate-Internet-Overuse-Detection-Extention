/**
 * Enhanced Popup Controller with user feedback and privacy controls
 */

class PopupController {
    constructor() {
        this.isInitialized = false;
        this.updateInterval = null;
        this.currentPrediction = null;
        this.isPaused = false;
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            await this.loadCurrentSettings();
            this.startPeriodicUpdates();
            this.isInitialized = true;
            console.log('Popup controller initialized');
        } catch (error) {
            console.error('Popup initialization error:', error);
            this.showError('Failed to initialize extension');
        }
    }

    setupEventListeners() {
        // Settings controls
        document.getElementById('enableMonitoring').addEventListener('change', (e) => {
            this.updateSetting('enabled', e.target.checked);
        });

        document.getElementById('enableNotifications').addEventListener('change', (e) => {
            this.updateSetting('notificationsEnabled', e.target.checked);
        });

        document.getElementById('sensitivitySlider').addEventListener('input', (e) => {
            this.updateSetting('sensitivity', parseFloat(e.target.value));
        });

        // Action buttons
        document.getElementById('viewStatsBtn').addEventListener('click', () => {
            this.handleViewStats();
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.handlePauseToggle();
        });

        document.getElementById('takeBreakBtn').addEventListener('click', () => {
            this.handleTakeBreak();
        });

        document.getElementById('deleteDataBtn').addEventListener('click', () => {
            this.handleDeleteData();
        });

        // Feedback buttons
        document.getElementById('feedbackCorrect').addEventListener('click', () => {
            this.submitFeedback(true);
        });

        document.getElementById('feedbackIncorrect').addEventListener('click', () => {
            this.submitFeedback(false);
        });

        // Download All Data
        document.getElementById('downloadDataBtn').addEventListener('click', () => {
            this.handleDownloadData();
        });
    }

    async loadCurrentSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getStats' });
            if (response && response.settings) {
                this.updateUIFromSettings(response.settings);
                this.isPaused = response.isPaused || false;
                this.updatePauseButton();
            }
        } catch (error) {
            console.warn('Settings load error:', error);
            this.showError('Could not load settings');
        }
    }

    async updateStats() {
        try {
            const stats = await chrome.runtime.sendMessage({ action: 'getStats' });
            if (stats && !stats.error) {
                this.updateSessionDisplay(stats);
                this.updateMLInsights(stats);
                this.updateUsageLevel(stats);
                this.updateLastUpdate();
                this.updateStatusIndicator(stats);
            } else {
                console.warn('Stats update returned error:', stats?.error);
            }
        } catch (error) {
            console.warn('Stats update error:', error);
            this.showConnectionError();
        }
    }

    updateSessionDisplay(stats) {
        const sessionData = stats.sessionStats || {};
        
        document.getElementById('sessionDuration').textContent = 
            this.formatDuration(sessionData.sessionDuration || 0);
        
        document.getElementById('websiteCount').textContent = 
            sessionData.domains?.length || '0';
        
        // Calculate activity level
        const activityScore = this.calculateActivityLevel(sessionData);
        document.getElementById('activityLevel').textContent = activityScore;
    }

    updateMLInsights(stats) {
        const recentPredictions = stats.recentPredictions || [];
        const latestPrediction = recentPredictions[recentPredictions.length - 1];
        
        if (latestPrediction) {
            this.currentPrediction = latestPrediction;
            
            const patternScore = Math.round((latestPrediction.prediction || 0) * 100);
            const confidence = Math.round((latestPrediction.confidence || 0) * 100);
            
            document.getElementById('patternScore').textContent = `${patternScore}%`;
            document.getElementById('confidenceScore').textContent = `${confidence}%`;
            
            // Show feedback section if prediction confidence is high
            if (confidence > 70) {
                this.showFeedbackSection();
            } else {
                this.hideFeedbackSection();
            }
        } else {
            document.getElementById('patternScore').textContent = '--';
            document.getElementById('confidenceScore').textContent = '--';
            this.hideFeedbackSection();
        }
    }

    updateUsageLevel(stats) {
        const recentPredictions = stats.recentPredictions || [];
        const recentAnomalies = recentPredictions.filter(p => p.prediction === 1).length;
        const usageRatio = recentPredictions.length > 0 ? 
            recentAnomalies / recentPredictions.length : 0;

        const usageFill = document.getElementById('usageFill');
        const usageLabel = document.getElementById('usageLabel');

        usageFill.style.width = (usageRatio * 100) + '%';

        if (usageRatio < 0.3) {
            usageLabel.textContent = 'Healthy Usage';
            usageFill.style.background = '#48bb78';
        } else if (usageRatio < 0.6) {
            usageLabel.textContent = 'Moderate Usage';
            usageFill.style.background = '#ed8936';
        } else {
            usageLabel.textContent = 'Excessive Usage';
            usageFill.style.background = '#e53e3e';
        }
    }

    updateStatusIndicator(stats) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = indicator.querySelector('.status-text');
        
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

    showFeedbackSection() {
        const feedbackSection = document.getElementById('feedbackSection');
        feedbackSection.style.display = 'block';
        feedbackSection.classList.add('fade-in');
    }

    hideFeedbackSection() {
        const feedbackSection = document.getElementById('feedbackSection');
        feedbackSection.style.display = 'none';
    }

    async submitFeedback(isCorrect) {
        try {
            const feedback = {
                timestamp: Date.now(),
                isCorrect: isCorrect,
                confidence: 1.0,
                reasoning: isCorrect ? 'User confirmed prediction' : 'User corrected prediction'
            };
            
            await chrome.runtime.sendMessage({ 
                action: 'submitFeedback', 
                feedback: feedback 
            });
            
            this.hideFeedbackSection();
            this.showFeedbackThankYou(isCorrect);
            
        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showError('Failed to submit feedback');
        }
    }

    showFeedbackThankYou(isCorrect) {
        // Create temporary thank you message
        const thankYou = document.createElement('div');
        thankYou.className = 'feedback-thankyou';
        thankYou.textContent = `Thank you! Your feedback helps improve accuracy.`;
        thankYou.style.cssText = `
            padding: 12px;
            background: #d4edda;
            color: #155724;
            border-radius: 8px;
            margin-top: 8px;
            font-size: 12px;
            text-align: center;
        `;
        
        const insightsSection = document.querySelector('.insights-section');
        insightsSection.appendChild(thankYou);
        
        setTimeout(() => {
            thankYou.remove();
        }, 3000);
    }

    // FIXED: Add missing handleViewStats method
    handleViewStats() {
        // Open detailed stats page
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/stats/stats.html'),
            active: true
        });
    }

    async handlePauseToggle() {
        try {
            const action = this.isPaused ? 'resumeTracking' : 'pauseTracking';
            const response = await chrome.runtime.sendMessage({ action: action });
            
            if (response.success) {
                this.isPaused = response.paused;
                this.updatePauseButton();
                await this.updateStats(); // Refresh display
            }
        } catch (error) {
            console.error('Pause toggle error:', error);
            this.showError('Failed to toggle tracking');
        }
    }

    updatePauseButton() {
        const pauseBtn = document.getElementById('pauseBtn');
        if (this.isPaused) {
            pauseBtn.textContent = '▶️ Resume';
            pauseBtn.classList.add('btn-primary');
            pauseBtn.classList.remove('btn-secondary');
        } else {
            pauseBtn.textContent = '⏸️ Pause';
            pauseBtn.classList.add('btn-secondary');
            pauseBtn.classList.remove('btn-primary');
        }
    }

    handleTakeBreak() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/popup/break-timer.html'),
            active: true
        });
        window.close();
    }

    async handleDeleteData() {
        const confirmed = confirm(
            'This will permanently delete all your usage data, including:\n\n' +
            '• Browse history tracked by this extension\n' +
            '• Machine learning model data\n' +
            '• User feedback and preferences\n\n' +
            'This action cannot be undone. Continue?'
        );
        
        if (confirmed) {
            try {
                await chrome.runtime.sendMessage({ action: 'deleteAllData' });
                this.showSuccess('All data deleted successfully');
                setTimeout(() => window.close(), 1500);
            } catch (error) {
                console.error('Data deletion error:', error);
                this.showError('Failed to delete data');
            }
        }
    }

    handleDownloadData() {
        chrome.storage.local.get(null, (allData) => {
        // 1. Serialize to JSON with indentation
        const jsonStr = JSON.stringify(allData, null, 2);

        // 2. Create a Blob and object URL
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // 3. Create a temporary anchor to trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = 'checkmate_data.json';
        document.body.appendChild(a); // Required for Firefox
        a.click();

        // 4. Cleanup
        a.remove();
        URL.revokeObjectURL(url);
        });
    }

    calculateActivityLevel(sessionStats) {
        const scrolls = sessionStats.scrollEvents || 0;
        const clicks = sessionStats.clickEvents || 0;
        const keystrokes = sessionStats.keystrokeEvents || 0;
        
        const totalActivity = scrolls + clicks + keystrokes;
        const sessionMinutes = Math.max((sessionStats.sessionDuration || 0) / (1000 * 60), 1);
        const activityRate = totalActivity / sessionMinutes;
        
        if (activityRate < 5) return 'Low';
        if (activityRate < 15) return 'Med';
        return 'High';
    }

    updateUIFromSettings(settings) {
        document.getElementById('enableMonitoring').checked = settings.enabled || false;
        document.getElementById('enableNotifications').checked = settings.notificationsEnabled || false;
        document.getElementById('sensitivitySlider').value = settings.sensitivity || 0.5;
    }

    async updateSetting(key, value) {
        try {
            const settings = { [key]: value };
            await chrome.runtime.sendMessage({ 
                action: 'updateSettings', 
                settings: settings 
            });
        } catch (error) {
            console.error('Setting update error:', error);
            this.showError('Failed to update setting');
        }
    }

    startPeriodicUpdates() {
        this.updateStats(); // Initial update
        this.updateInterval = setInterval(() => {
            this.updateStats();
        }, 5000); // Update every 5 seconds
    }

    updateLastUpdate() {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastUpdate').textContent = timeString;
    }

    formatDuration(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    showError(message) {
        console.error(message);
        // Could implement toast notifications here
    }

    showSuccess(message) {
        console.log(message);
        // Could implement toast notifications here
    }

    showConnectionError() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = statusIndicator.querySelector('.status-text');
        statusText.textContent = 'Connection Error';
        statusIndicator.className = 'status-indicator status-error';
    }
}

// Initialize popup controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
