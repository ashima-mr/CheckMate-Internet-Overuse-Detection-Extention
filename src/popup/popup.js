/**
 * Simplified Popup Controller - Focused on status and basic controls only
 * All complex visualizations moved to stats page
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
            console.log('Simplified popup controller initialized');
        } catch (error) {
            console.error('Popup initialization error:', error);
            this.showError('Failed to initialize extension');
        }
    }

    setupEventListeners() {
        // Settings controls with null safety
        const controls = [
            { id: 'enableMonitoring', event: 'change', handler: e => this.updateSetting('enabled', e.target.checked) },
            { id: 'enableNotifications', event: 'change', handler: e => this.updateSetting('notificationsEnabled', e.target.checked) },
            { id: 'sensitivitySlider', event: 'input', handler: e => this.updateSetting('sensitivity', parseFloat(e.target.value)) }
        ];

        controls.forEach(({ id, event, handler }) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener(event, handler);
        });

        // Action buttons
        const actionButtons = [
            { id: 'viewStatsBtn', handler: () => this.handleViewStats() },
            { id: 'manageWebsitesBtn', handler: () => this.handleManageWebsites() },
            { id: 'pauseBtn', handler: () => this.handlePauseToggle() },
            { id: 'takeBreakBtn', handler: () => this.handleTakeBreak() },
            { id: 'deleteDataBtn', handler: () => this.handleDeleteData() },
            { id: 'downloadDataBtn', handler: () => this.handleDownloadData() }
        ];

        actionButtons.forEach(({ id, handler }) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener('click', handler);
        });

        // Feedback buttons
        ['feedbackProductive', 'feedbackNonproductive', 'feedbackOveruse'].forEach((id, index) => {
            const element = document.getElementById(id);
            const labels = ['productive', 'non-productive', 'overuse'];
            if (element) {
                element.addEventListener('click', () => this.submitFeedback(labels[index]));
            }
        });
    }

    async updateSetting(key, value) {
        try {
            await chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: { [key]: value }
            });
        } catch (error) {
            console.error('Setting update error:', error);
            this.showError('Failed to update setting');
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
                if (stats.needsFeedback) this.showFeedbackSection();
            }
        } catch (error) {
            console.warn('Stats update error:', error);
            this.showConnectionError();
        }
    }

    updateSessionDisplay(stats) {
        const sessionData = stats.sessionStats || {};
        const updates = [
            { id: 'sessionDuration', value: this.formatDuration(sessionData.sessionDuration || 0) },
            { id: 'websiteCount', value: sessionData.domains?.length || '0' },
            { id: 'activityLevel', value: this.calculateActivityLevel(sessionData) }
        ];

        updates.forEach(({ id, value }) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    updateMLInsights(stats) {
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
            this.updateRecentPrediction(latestPrediction);
        } else {
            if (patternScore) patternScore.textContent = '--';
            if (confidenceScore) confidenceScore.textContent = '--';
            this.hideFeedbackSection();
            this.hideRecentPrediction();
        }
    }

    updateRecentPrediction(prediction) {
        const recentPrediction = document.getElementById('recentPrediction');
        const predictionDetails = document.getElementById('predictionDetails');
        
        if (recentPrediction && predictionDetails) {
            const classLabels = ['Productive', 'Non-Productive', 'Overuse'];
            const classColors = ['#48bb78', '#ed8936', '#e53e3e'];
            
            predictionDetails.innerHTML = `
                <div class="prediction-item">
                    <span class="prediction-class" style="background-color: ${classColors[prediction.prediction]}; color: white; padding: 4px 8px; border-radius: 4px;">
                        ${classLabels[prediction.prediction]}
                    </span>
                    <span class="prediction-confidence">${Math.round(prediction.confidence * 100)}% confident</span>
                    <span class="prediction-time">${new Date(prediction.timestamp).toLocaleTimeString()}</span>
                </div>
            `;
            recentPrediction.style.display = 'block';
        }
    }

    updateUsageLevel(stats) {
        const recentPredictions = stats.recentPredictions || [];
        if (recentPredictions.length === 0) {
            this.setUsageIndicator(0.33, 'Initializing...');
            return;
        }

        const classCount = [0, 0, 0];
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
                    healthScore >= 0.4 ? 'Moderate Usage' : 'Concerning Usage';

        this.setUsageIndicator(1 - healthScore, label);
    }

    setUsageIndicator(fillRatio, label) {
        const usageFill = document.getElementById('usageFill');
        const usageLabel = document.getElementById('usageLabel');

        if (usageFill) {
            usageFill.style.width = `${fillRatio * 100}%`;
            usageFill.style.background = fillRatio < 0.3 ? '#48bb78' :
                                       fillRatio < 0.6 ? '#ed8936' : '#e53e3e';
        }

        if (usageLabel) {
            usageLabel.textContent = `Real-Time Usage Health: ${label}`;
        }
    }

    // Action handlers
    handleViewStats() {
        chrome.tabs.create({ 
            url: chrome.runtime.getURL('src/popup/stats.html'), 
            active: true 
        });
    }

    async submitFeedback(label) {
        try {
            await chrome.runtime.sendMessage({
                action: 'submitFeedback',
                feedback: { timestamp: Date.now(), trueClass: label }
            });
            this.hideFeedbackSection();
            this.showFeedbackThankYou(label);
        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showError('Failed to submit feedback');
        }
    }

    // Utility methods
    formatDuration(ms) {
        const h = Math.floor(ms/(1000*60*60));
        const m = Math.floor((ms%(1000*60*60))/(1000*60));
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    calculateActivityLevel(sessionStats) {
        const total = (sessionStats.scrollEvents||0) + (sessionStats.clickEvents||0) + (sessionStats.keystrokeEvents||0);
        const mins = Math.max((sessionStats.sessionDuration||0)/(1000*60), 1);
        const rate = total/mins;
        return rate < 5 ? 'Low' : rate < 15 ? 'Med' : 'High';
    }

    startPeriodicUpdates() {
        this.updateStats();
        this.updateInterval = setInterval(() => this.updateStats(), 5000);
    }

    showFeedbackSection() {
        const sec = document.getElementById('feedbackSection');
        if (sec) sec.style.display = 'block';
    }

    hideFeedbackSection() {
        const sec = document.getElementById('feedbackSection');
        if (sec) sec.style.display = 'none';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
