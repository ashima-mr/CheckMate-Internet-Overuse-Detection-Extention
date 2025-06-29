class PopupController {
  constructor() {
    this.isInitialized = false;
    this.updateInterval = null;
    this.currentPrediction = null;
    this.isPaused = false;
    this.feedbackManager = new FeedbackManager();
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
    // Existing controls
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

    // Session feedback buttons
    document.getElementById('feedbackProductive').addEventListener('click', () => {
      this.submitSessionFeedback('productive');
    });

    document.getElementById('feedbackUnproductive').addEventListener('click', () => {
      this.submitSessionFeedback('unproductive');
    });

    document.getElementById('feedbackUnhealthy').addEventListener('click', () => {
      this.submitSessionFeedback('unhealthy');
    });
  }

  async updateStats() {
    try {
      const stats = await chrome.runtime.sendMessage({ action: 'getStats' });
      if (stats && !stats.error) {
        this.updateSessionDisplay(stats);
        this.updateMLInsights(stats);
        this.updateUsageHealthIndicator(stats);
        this.updateLastUpdate();
        this.updateStatusIndicator(stats);
        this.checkForFeedbackPrompt(stats);
      }
    } catch (error) {
      console.warn('Stats update error:', error);
      this.showConnectionError();
    }
  }

  updateMLInsights(stats) {
    const recentPredictions = stats.recentPredictions || [];
    const latestPrediction = recentPredictions[recentPredictions.length - 1];
    
    if (latestPrediction) {
      this.currentPrediction = latestPrediction;
      
      // Pattern score (now properly calculated and dynamic)
      const patternScore = Math.round((latestPrediction.prediction / 2) * 100); // Scale to 0-100%
      document.getElementById('patternScore').textContent = `${patternScore}%`;
      
      // AI assessment confidence (now properly calculated and dynamic)
      const confidence = Math.round((latestPrediction.confidence || 0) * 100);
      document.getElementById('confidenceScore').textContent = `${confidence}%`;
      
      // Update colors based on prediction class
      this.updateInsightColors(latestPrediction.prediction, confidence);
    } else {
      document.getElementById('patternScore').textContent = '--';
      document.getElementById('confidenceScore').textContent = '--';
    }
  }

  updateUsageHealthIndicator(stats) {
    const recentPredictions = stats.recentPredictions || [];
    
    if (recentPredictions.length === 0) {
      this.setUsageIndicator(0.33, 'Initializing...');
      return;
    }
    
    // Calculate health score based on recent predictions
    const classCount = [0, 0, 0]; // [productive, unproductive, unhealthy]
    recentPredictions.slice(-10).forEach(pred => {
      if (pred.prediction >= 0 && pred.prediction <= 2) {
        classCount[pred.prediction]++;
      }
    });
    
    const total = classCount.reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      this.setUsageIndicator(0.33, 'No Data');
      return;
    }
    
    // Calculate weighted health score
    const healthScore = (classCount[0] * 1.0 + classCount[1] * 0.5 + classCount[2] * 0.0) / total;
    
    let label = '';
    if (healthScore >= 0.7) {
      label = 'Healthy Usage';
    } else if (healthScore >= 0.4) {
      label = 'Moderate Usage';
    } else {
      label = 'Concerning Usage';
    }
    
    this.setUsageIndicator(1 - healthScore, label); // Invert for visual representation
  }

  setUsageIndicator(fillRatio, label) {
    const usageFill = document.getElementById('usageFill');
    const usageLabel = document.getElementById('usageLabel');
    
    usageFill.style.width = (fillRatio * 100) + '%';
    usageLabel.textContent = `Real-time Usage Health Indicator: ${label}`;
    
    // Update color based on health
    if (fillRatio < 0.3) {
      usageFill.style.background = '#48bb78'; // Green
    } else if (fillRatio < 0.6) {
      usageFill.style.background = '#ed8936'; // Orange
    } else {
      usageFill.style.background = '#e53e3e'; // Red
    }
  }

  checkForFeedbackPrompt(stats) {
    if (stats.needsFeedback || this.feedbackManager.shouldPromptForFeedback()) {
      this.showSessionFeedbackSection();
    }
  }

  showSessionFeedbackSection() {
    const feedbackSection = document.getElementById('sessionFeedbackSection');
    feedbackSection.style.display = 'block';
    feedbackSection.classList.add('fade-in');
  }

  hideSessionFeedbackSection() {
    const feedbackSection = document.getElementById('sessionFeedbackSection');
    feedbackSection.style.display = 'none';
  }

  async submitSessionFeedback(sessionType) {
    try {
      const feedback = {
        sessionType: sessionType,
        timestamp: Date.now(),
        confidence: 1.0,
        source: 'manual_popup'
      };

      await chrome.runtime.sendMessage({
        action: 'submitSessionFeedback',
        feedback: feedback
      });

      this.hideSessionFeedbackSection();
      this.showFeedbackThankYou(sessionType);
    } catch (error) {
      console.error('Session feedback submission error:', error);
      this.showError('Failed to submit feedback');
    }
  }

  handleTakeBreak() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/popup/break-timer.html'),
      active: true
    });
    window.close();
  }

  handleManageWebsites() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/popup/options.html'),
      active: true
    });
  }
}
