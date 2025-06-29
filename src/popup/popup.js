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

    setupEventListeners() {
        // Settings controls
        document.getElementById('enableMonitoring').addEventListener('change', e => {
            this.updateSetting('enabled', e.target.checked);
        });
        document.getElementById('enableNotifications').addEventListener('change', e => {
            this.updateSetting('notificationsEnabled', e.target.checked);
        });
        document.getElementById('sensitivitySlider').addEventListener('input', e => {
            this.updateSetting('sensitivity', parseFloat(e.target.value));
        });

        // Action buttons
        document.getElementById('viewStatsBtn').addEventListener('click', () => {
            this.handleViewStats();
        });
        document.getElementById('manageWebsitesBtn').addEventListener('click', () => {
            this.handleManageWebsites();
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
        document.getElementById('downloadDataBtn').addEventListener('click', () => {
            this.handleDownloadData();
        });

        // Feedback correctness buttons
        document.getElementById('feedbackProductive').addEventListener('click', () => {
            this.submitFeedback('productive');
        });
        document.getElementById('feedbackNonproductive').addEventListener('click', () => {
            this.submitFeedback('non-productive');
        });
        document.getElementById('feedbackOveruse').addEventListener('click', () => {
            this.submitFeedback('overuse');
        });
    }

    async loadCurrentSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getStats' });
            // response.settings must include { enabled, notificationsEnabled, sensitivity }
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

    startPeriodicUpdates() {
        this.updateStats(); // Initial update
        this.updateInterval = setInterval(() => {
            this.updateStats();
        }, 5000); // Update every 5 seconds
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
                if (stats.needsFeedback) this.showFeedbackSection();
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
        const activityScore = this.calculateActivityLevel(sessionData);
        document.getElementById('activityLevel').textContent = activityScore;
    }

    updateMLInsights(stats) {
        const recentPredictions = stats.recentPredictions || [];
        const latestPrediction = recentPredictions[recentPredictions.length - 1];
        if (latestPrediction) {
            this.currentPrediction = latestPrediction;
            const patternScore = Math.round((latestPrediction.prediction / 2) * 100);
            const confidence = Math.round((latestPrediction.confidence || 0) * 100);
            document.getElementById('patternScore').textContent = `${patternScore}%`;
            document.getElementById('confidenceScore').textContent = `${confidence}%`;
            this.updateInsightColors(latestPrediction.prediction, confidence);
            this.showFeedbackSection();
        } else {
            document.getElementById('patternScore').textContent = '--';
            document.getElementById('confidenceScore').textContent = '--';
            this.hideFeedbackSection();
        }
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
        const usageFill = document.getElementById('usageFill');
        const usageLabel = document.getElementById('usageLabel');
        usageFill.style.width = `${fillRatio * 100}%`;
        usageLabel.textContent = `Real-Time Usage Health Indicator: ${label}`;
        usageFill.style.background = fillRatio < 0.3 ? '#48bb78' :
                                     fillRatio < 0.6 ? '#ed8936' : '#e53e3e';
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
        const sec = document.getElementById('feedbackSection');
        sec.style.display = 'block';
        sec.classList.add('fade-in');
    }

    hideFeedbackSection() {
        const sec = document.getElementById('feedbackSection');
        sec.style.display = 'none';
    }

    /** Submit the chosen ML class label as feedback */
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
        const msg = document.createElement('div');
        msg.className = 'feedback-thankyou';
        msg.textContent = `Thank you! You marked this session as "${label}".`;
        document.querySelector('.insights-section').appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
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
            if (resp.success) {
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
        btn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
        btn.classList.toggle('btn-primary', this.isPaused);
        btn.classList.toggle('btn-secondary', !this.isPaused);
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
            a.download = 'popup_data.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }

    calculateActivityLevel(sessionStats) {
        const total = (sessionStats.scrollEvents||0) + (sessionStats.clickEvents||0) + (sessionStats.keystrokeEvents||0);
        const mins = Math.max((sessionStats.sessionDuration||0)/(1000*60),1);
        const rate = total/mins;
        return rate < 5 ? 'Low' : rate < 15 ? 'Med' : 'High';
    }

    updateUIFromSettings(settings) {
        document.getElementById('enableMonitoring').checked = settings.enabled || false;
        document.getElementById('enableNotifications').checked = settings.notificationsEnabled || false;
        document.getElementById('sensitivitySlider').value = settings.sensitivity || 0.5;
    }

    updateLastUpdate() {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('lastUpdate').textContent = now;
    }

    formatDuration(ms) {
        const h = Math.floor(ms/(1000*60*60));
        const m = Math.floor((ms%(1000*60*60))/(1000*60));
        return h>0 ? `${h}h ${m}m` : `${m}m`;
    }

    showError(message) { console.error(message); }
    showSuccess(message) { console.log(message); }
    showConnectionError() {
        const ind = document.getElementById('statusIndicator');
        ind.querySelector('.status-text').textContent = 'Connection Error';
        ind.className = 'status-indicator status-error';
    }
}

// Initialize popup controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
