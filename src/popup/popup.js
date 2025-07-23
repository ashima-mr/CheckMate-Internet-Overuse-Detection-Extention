/**
 * Chrome Extension Popup JavaScript
 * Handles UI interactions and communication with service worker
 */

class PopupManager {
    constructor() {
        this.isTracking = false;
        this.currentData = null;
        this.updateInterval = null;
        
        this.initializeElements();
        this.bindEventListeners();
        this.startDataUpdates();
        this.loadInitialData();

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'PREDICTION_UPDATE' && message.data && message.data.prediction) {
                this.updatePredictionUI(message.data);
            }
        });
    }

    initializeElements() {
        const el = id => {
            const node = document.getElementById(id);
            if (!node) console.warn(`PopupManager: Missing element #${id}`);
            return node;
        };
        // Status elements
        this.statusIndicator = el('statusIndicator');
        this.statusText      = el('statusText');
        this.trackingStatus  = el('trackingStatus');
        
        // Prediction elements
        this.mainPrediction  = el('mainPrediction');
        this.confidenceBadge = el('confidenceBadge');
        this.predictionIcon  = el('predictionIcon');
        this.mspcPrediction  = el('mspcPrediction');
        this.hatPrediction   = el('hatPrediction');
        
        // Metrics elements
        this.lastDrift = el('lastDrift');
        this.adwinWindow = el('adwinWindow');
        this.lastOveruse = el('lastOveruse');
        this.sessionDuration = el('sessionDuration');
        this.totalInteractions = el('totalInteractions');
        
        // Control buttons
        this.pauseResumeBtn = el('pauseResumeBtn');
        this.pauseResumeIcon = el('pauseResumeIcon');
        this.pauseResumeText = el('pauseResumeText');
        this.feedbackBtn = el('feedbackBtn');
        this.detailedStatsBtn = el('detailedStatsBtn');
        
        // Download buttons
        this.downloadCurrentBtn = el('downloadCurrentBtn');
        this.downloadSessionBtn = el('downloadSessionBtn');
        this.downloadTabBtn = el('downloadTabBtn');
        this.downloadMetricsBtn = el('downloadMetricsBtn');
        
        // System buttons
        this.resetSystemBtn = el('resetSystemBtn');
        this.deleteDataBtn = el('deleteDataBtn');
        
        // Overlay and toast
        this.loadingOverlay = el('loadingOverlay');
        this.toast = el('toast');
        this.toastIcon = el('toastIcon');
        this.toastMessage = el('toastMessage');
    }

    bindEventListeners() {
        // Control buttons
        this.pauseResumeBtn.addEventListener('click', () => this.toggleTracking());
        this.feedbackBtn.addEventListener('click', () => this.triggerFeedback());
        this.detailedStatsBtn.addEventListener('click', () => this.openDetailedStats());
        
        // Download buttons
        this.downloadCurrentBtn.addEventListener('click', () => this.downloadData('current'));
        this.downloadSessionBtn.addEventListener('click', () => this.downloadData('session'));
        this.downloadTabBtn.addEventListener('click', () => this.downloadData('tab'));
        this.downloadMetricsBtn.addEventListener('click', () => this.downloadData('metrics'));
        
        // System buttons
        this.resetSystemBtn.addEventListener('click', () => this.resetSystem());
        this.deleteDataBtn.addEventListener('click', () => this.deleteAllData());
    }

    async loadInitialData() {
        try {
            await this.updateSystemStatus();
            await this.updateCurrentStats();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('⚠️', 'Failed to load system data');
        }
    }

    startDataUpdates() {
        // Update data every 5 seconds
        this.updateInterval = setInterval(async () => {
            try {
                await this.updateSystemStatus();
                await this.updateCurrentStats();
            } catch (error) {
                console.error('Error updating data:', error);
            }
        }, 5000);
    }

    stopDataUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async updateSystemStatus() {
        try {
            const response = await this.sendMessage({ type: 'GET_SYSTEM_STATUS' });
            
            if (response && response.state) {
                this.isTracking = response.state.isTracking;
                this.updateTrackingUI();
            }
        } catch (error) {
            console.error('Error getting system status:', error);
        }
    }

    async updateCurrentStats() {
        try {
            const response = await this.sendMessage({ type: 'GET_CURRENT_STATS' });
            
            if (response && !response.error) {
                this.currentData = response;
                this.updatePredictionUI(response);
                this.updateMetricsUI(response);
                await this.updateSessionDuration();
            }
        } catch (error) {
            console.error('Error getting current stats:', error);
        }
    }

    updateTrackingUI() {
        if (this.isTracking) {
            this.statusIndicator.classList.remove('inactive');
            this.statusText.textContent = 'Active';
            this.pauseResumeIcon.textContent = '⏸️';
            this.pauseResumeText.textContent = 'Pause Tracking';
        } else {
            this.statusIndicator.classList.add('inactive');
            this.statusText.textContent = 'Paused';
            this.pauseResumeIcon.textContent = '▶️';
            this.pauseResumeText.textContent = 'Resume Tracking';
        }
    }

    updatePredictionUI(data) {
        try {
            // data.prediction is {vote, confidence, mspcVote, hatOriginal, hatVoteRemapped}
            const pred = data.prediction;
            if (!pred) return;

            // 1) Main (ensemble) prediction
            this.updateMainPrediction(pred);

            // 2) MSPC prediction
            if (this.mspcPrediction) {
                const cls = pred.mspcVote === 2 ? 'mspc-alert">Over UCL' : 'mspc-normal">Under UCL';
                this.mspcPrediction.innerHTML = `<span class="${cls}</span>`;
            }

            // 3) HAT prediction
            if (this.hatPrediction) {
                const hatClasses = ['status-productive">Productive', 'status-non-productive">Non-Productive', 'status-overuse">Overuse'];
                const idx = pred.hatVoteRemapped || pred.hatOriginal;
                const cls = hatClasses[idx] || hatClasses[0];
                this.hatPrediction.innerHTML = `<span class="${cls}</span>`;
            }

        } catch (error) {
            console.error('Error updating prediction UI:', error);
        }
    }

    updateMainPrediction(prediction) {
        const txt = this.mainPrediction.querySelector('.prediction-text');
        if (!txt) return;

        if (prediction.vote === 1) {
            txt.textContent = 'Normal Use';
            txt.className = 'prediction-text status-normal';
            this.predictionIcon.className = 'prediction-icon status-normal';
        } else {
            txt.textContent = 'Overuse Detected';
            txt.className = 'prediction-text status-overuse';
            this.predictionIcon.className = 'prediction-icon status-overuse';
        }
        if (this.confidenceBadge) {
            this.confidenceBadge.textContent = `${Math.round(prediction.confidence * 100)}%`;
        }
    }

    updateMetricsUI(data) {
        try {
            // Update concept drift time
            if (data.metrics && data.metrics.adwinDistribution) {
                const driftEvents = data.metrics.adwinDistribution.shrinkageEvents;
                if (driftEvents && driftEvents.length > 0) {
                    const lastDrift = driftEvents[driftEvents.length - 1];
                    this.lastDrift.textContent = this.formatTimestamp(lastDrift.timestamp);
                } else {
                    this.lastDrift.textContent = 'Never';
                }
            } else {
                this.lastDrift.textContent = 'Never';
            }

            // Update ADWIN window size
            if (data.metrics && data.metrics.adwinDistribution) {
                const stats = data.metrics.adwinDistribution.stats;
                if (stats && stats.mean) {
                    this.adwinWindow.textContent = Math.round(stats.mean).toLocaleString();
                } else {
                    this.adwinWindow.textContent = '1000';
                }
            } else {
                this.adwinWindow.textContent = '1000';
            }

            // Update last overuse notification
            this.updateLastOveruseTime();

            // Update total interactions
            if (data.system && data.system.totalInteractions) {
                this.totalInteractions.textContent = data.system.totalInteractions.toLocaleString();
            } else {
                this.totalInteractions.textContent = '0';
            }

        } catch (error) {
            console.error('Error updating metrics UI:', error);
        }
    }

    // Fetch and render the current tab's session duration
    async updateSessionDuration() {
      try {
        // Ask the service worker for this tab's session info
        const tabSession = await this.sendMessage({ type: 'GET_TAB_SESSION_STATS' });
        if (tabSession && tabSession.session && tabSession.session.startTime) {
          const start = tabSession.session.startTime;
          const now = Date.now();
          const diffMs = now - start;
          const mins = Math.floor(diffMs / 60000);
          const secs = Math.floor((diffMs % 60000) / 1000);
          this.sessionDuration.textContent = `${mins}m ${secs}s`;
        } else {
          this.sessionDuration.textContent = '--';
        }
      } catch (error) {
        console.error('Error getting session duration:', error);
        this.sessionDuration.textContent = '--';
      }
    }

    async updateLastOveruseTime() {
        try {
            // Get last overuse notification time from storage
            const result = await chrome.storage.local.get(['lastOveruseTime']);
            if (result.lastOveruseTime) {
                this.lastOveruse.textContent = this.formatTimestamp(result.lastOveruseTime);
            } else {
                this.lastOveruse.textContent = 'None';
            }
        } catch (error) {
            this.lastOveruse.textContent = 'None';
        }
    }

    formatTimestamp(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    async toggleTracking() {
        this.showLoading(true);
        
        try {
            const message = this.isTracking ? 
                { type: 'PAUSE_TRACKING' } : 
                { type: 'RESUME_TRACKING' };
            
            const response = await this.sendMessage(message);
            
            if (response && response.success) {
                this.isTracking = !this.isTracking;
                this.updateTrackingUI();
                
                const action = this.isTracking ? 'resumed' : 'paused';
                this.showToast('✅', `Tracking ${action} successfully`);
            } else {
                this.showToast('⚠️', 'Failed to toggle tracking');
            }
        } catch (error) {
            console.error('Error toggling tracking:', error);
            this.showToast('⚠️', 'Failed to toggle tracking');
        } finally {
            this.showLoading(false);
        }
    }

    async triggerFeedback() {
        try {
            // This triggers the feedback notification system
            await this.sendMessage({ type: 'USER_FEEDBACK', data: { trigger: true } });
            this.showToast('💭', 'Feedback notification triggered');
        } catch (error) {
            console.error('Error triggering feedback:', error);
            this.showToast('⚠️', 'Failed to trigger feedback');
        }
    }

    openDetailedStats() {
        // Open detailed stats page in new tab
        chrome.tabs.create({ 
            url: chrome.runtime.getURL('popup/stats.html') 
        });
    }

    async downloadData(type) {
        this.showLoading(true);
        
        try {
            let messageType;
            let filename;
            
            switch (type) {
                case 'current':
                    messageType = 'GET_CURRENT_STATS';
                    filename = 'current_usage_data.json';
                    break;
                case 'session':
                    messageType = 'GET_ALL_SESSION_STATS';
                    filename = 'session_data.json';
                    break;
                case 'tab':
                    messageType = 'GET_TAB_SESSION_STATS';
                    filename = 'tab_data.json';
                    break;
                case 'metrics':
                    messageType = 'GET_CURRENT_STATS';
                    filename = 'metrics_data.json';
                    break;
                default:
                    throw new Error('Invalid download type');
            }

            const response = await this.sendMessage({ type: messageType });
            
            if (response && !response.error) {
                this.downloadJSON(response, filename);
                this.showToast('💾', `${filename} downloaded successfully`);
            } else {
                this.showToast('⚠️', 'Failed to download data');
            }
        } catch (error) {
            console.error('Error downloading data:', error);
            this.showToast('⚠️', 'Failed to download data');
        } finally {
            this.showLoading(false);
        }
    }

    downloadJSON(data, filename) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async resetSystem() {
        if (confirm('Are you sure you want to reset the system? This will restart the ML models but keep your data.')) {
            this.showLoading(true);
            
            try {
                const response = await this.sendMessage({ type: 'RESET_SYSTEM' });
                
                if (response && response.success) {
                    this.showToast('🔄', 'System reset successfully');
                    await this.loadInitialData();
                } else {
                    this.showToast('⚠️', 'Failed to reset system');
                }
            } catch (error) {
                console.error('Error resetting system:', error);
                this.showToast('⚠️', 'Failed to reset system');
            } finally {
                this.showLoading(false);
            }
        }
    }

    async deleteAllData() {
        if (confirm('Are you sure you want to delete ALL data? This action cannot be undone.')) {
            this.showLoading(true);
            
            try {
                const response = await this.sendMessage({ type: 'DELETE_ALL_DATA' });
                
                if (response && response.success) {
                    this.showToast('🗑️', 'All data deleted successfully');
                    await this.loadInitialData();
                } else {
                    this.showToast('⚠️', 'Failed to delete data');
                }
            } catch (error) {
                console.error('Error deleting data:', error);
                this.showToast('⚠️', 'Failed to delete data');
            } finally {
                this.showLoading(false);
            }
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.add('active');
        } else {
            this.loadingOverlay.classList.remove('active');
        }
    }

    showToast(icon, message) {
        this.toastIcon.textContent = icon;
        this.toastMessage.textContent = message;
        this.toast.classList.add('active');
        
        setTimeout(() => {
            this.toast.classList.remove('active');
        }, 3000);
    }

    // Cleanup when popup is closed
    cleanup() {
        this.stopDataUpdates();
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const popup = new PopupManager();
    // Expose for unload cleanup
    window.popupManager = popup;
    // Cleanup when popup is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            popup.cleanup();
        }
    });
});

// Handle unload
window.addEventListener('beforeunload', () => {
    // Always call cleanup if instance exists
    window.popupManager?.cleanup();
});
