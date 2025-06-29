/**
 * Content Script for Internet Overuse Detection
 * Runs on all web pages to gather user interaction data
 */

class PageActivityMonitor {
    constructor() {
        this.startTime = Date.now();
        this.lastActivityTime = Date.now();
        this.scrollCount = 0;
        this.clickCount = 0;
        this.keystrokes = 0;
        this.focusTime = 0;
        this.isPageVisible = !document.hidden;
        this.activityBuffer = [];
        this.reportingInterval = 30000; // 30 seconds

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startReporting();
        console.log('📊 Page Activity Monitor initialized on:', window.location.hostname);
    }

    setupEventListeners() {
        // Scroll tracking
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            this.scrollCount++;
            this.recordActivity('scroll');

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.reportScrollBehavior();
            }, 1000);
        }, { passive: true });

        // Click tracking
        document.addEventListener('click', (event) => {
            this.clickCount++;
            this.recordActivity('click', {
                element: event.target.tagName,
                x: event.clientX,
                y: event.clientY
            });
        }, { passive: true });

        // Keyboard tracking (count only, no content)
        document.addEventListener('keydown', () => {
            this.keystrokes++;
            this.recordActivity('keydown');
        }, { passive: true });

        // Focus/blur tracking
        window.addEventListener('focus', () => {
            this.isPageVisible = true;
            this.recordActivity('focus');
        });

        window.addEventListener('blur', () => {
            this.isPageVisible = false;
            this.recordActivity('blur');
        });

        // Page visibility API
        document.addEventListener('visibilitychange', () => {
            this.isPageVisible = !document.hidden;
            this.recordActivity('visibilitychange', {
                visible: this.isPageVisible
            });
        });

        // Mouse movement (throttled)
        let mouseMoveTimeout;
        document.addEventListener('mousemove', () => {
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = setTimeout(() => {
                this.recordActivity('mousemove');
            }, 5000); // Only record every 5 seconds
        }, { passive: true });

        // Page unload
        window.addEventListener('beforeunload', () => {
            this.reportFinalStats();
        });
    }

    recordActivity(type, data = {}) {
        const now = Date.now();
        this.lastActivityTime = now;

        this.activityBuffer.push({
            type,
            timestamp: now,
            data
        });

        // Keep buffer size manageable
        if (this.activityBuffer.length > 100) {
            this.activityBuffer.shift();
        }
    }

    reportScrollBehavior() {
        const scrollSpeed = this.calculateScrollSpeed();
        const scrollPattern = this.analyzeScrollPattern();

        this.sendToBackground({
            type: 'scroll_behavior',
            data: {
                speed: scrollSpeed,
                pattern: scrollPattern,
                count: this.scrollCount
            }
        });
    }

    calculateScrollSpeed() {
        const scrollEvents = this.activityBuffer.filter(a => a.type === 'scroll');
        if (scrollEvents.length < 2) return 0;

        const timeSpan = scrollEvents[scrollEvents.length - 1].timestamp - scrollEvents[0].timestamp;
        return scrollEvents.length / (timeSpan / 1000); // events per second
    }

    analyzeScrollPattern() {
        // Simple pattern analysis: consistent scrolling vs erratic
        const scrollEvents = this.activityBuffer.filter(a => a.type === 'scroll');
        if (scrollEvents.length < 3) return 'insufficient_data';

        const intervals = [];
        for (let i = 1; i < scrollEvents.length; i++) {
            intervals.push(scrollEvents[i].timestamp - scrollEvents[i-1].timestamp);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        // If standard deviation is low relative to mean, scrolling is consistent
        const consistencyRatio = stdDev / avgInterval;
        return consistencyRatio < 0.5 ? 'consistent' : 'erratic';
    }

    startReporting() {
        setInterval(() => {
            this.reportPeriodicStats();
        }, this.reportingInterval);
    }

    reportPeriodicStats() {
        const now = Date.now();
        const timeOnPage = now - this.startTime;
        const timeSinceLastActivity = now - this.lastActivityTime;

        const stats = {
            url: window.location.href,
            hostname: window.location.hostname,
            timeOnPage,
            timeSinceLastActivity,
            scrollCount: this.scrollCount,
            clickCount: this.clickCount,
            keystrokes: this.keystrokes,
            isVisible: this.isPageVisible,
            activityScore: this.calculateActivityScore(),
            engagementLevel: this.calculateEngagementLevel(),
            timestamp: now
        };

        this.sendToBackground({
            type: 'page_activity',
            data: stats
        });

        // Reset counters for next period
        this.resetCounters();
    }

    calculateActivityScore() {
        const timeSpan = this.reportingInterval / 1000; // in seconds
        const totalInteractions = this.scrollCount + this.clickCount + this.keystrokes;
        return Math.min(totalInteractions / timeSpan, 10); // Cap at 10 interactions per second
    }

    calculateEngagementLevel() {
        const totalInteractions = this.scrollCount + this.clickCount + this.keystrokes;

        if (totalInteractions === 0) return 'idle';
        if (totalInteractions < 5) return 'low';
        if (totalInteractions < 20) return 'medium';
        return 'high';
    }

    resetCounters() {
        this.scrollCount = 0;
        this.clickCount = 0;
        this.keystrokes = 0;
        this.activityBuffer = [];
    }

    reportFinalStats() {
        const finalStats = {
            url: window.location.href,
            hostname: window.location.hostname,
            totalTimeOnPage: Date.now() - this.startTime,
            finalScrollCount: this.scrollCount,
            finalClickCount: this.clickCount,
            finalKeystrokes: this.keystrokes
        };

        this.sendToBackground({
            type: 'page_session_end',
            data: finalStats
        });
    }

    sendToBackground(message) {
        try {
            chrome.runtime.sendMessage(message).catch(error => {
                // Service worker might be inactive, ignore errors
                console.debug('Background message failed:', error);
            });
        } catch (error) {
            console.debug('Runtime message error:', error);
        }
    }

    // Public methods for external access
    getCurrentStats() {
        return {
            timeOnPage: Date.now() - this.startTime,
            scrollCount: this.scrollCount,
            clickCount: this.clickCount,
            keystrokes: this.keystrokes,
            isVisible: this.isPageVisible,
            activityScore: this.calculateActivityScore(),
            engagementLevel: this.calculateEngagementLevel()
        };
    }
}

// Initialize the monitor
const pageActivityMonitor = new PageActivityMonitor();

////////////////////////////////////////////////////////////////////////////////
// 1) Helper to read & apply the user’s host→category rules on this page

function applySiteCategory() {
  chrome.storage.sync.get({ siteCategories: {} }, data => {
    const map = data.siteCategories;           // the stored rules
    const host = location.hostname;            // current tab’s host
    const category = map[host];                // lookup

    if (category === 'unhealthy') {
      // e.g. inject a red warning banner
      injectBanner('Warning: Unhealthy site usage detected', 'red');
    } 
    else if (category === 'productive') {
      // e.g. add a green border
      document.body.style.border = '5px solid #48bb78';
    }
    // handle other categories as needed…
  });
}

////////////////////////////////////////////////////////////////////////////////
// 2) Run on initial load

applySiteCategory();

////////////////////////////////////////////////////////////////////////////////
// 3) Re-run whenever the user edits their rules

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.siteCategories) {
    applySiteCategory();
  }
});

// Make it globally accessible for debugging
window.pageActivityMonitor = pageActivityMonitor;

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageStats') {
        sendResponse(pageActivityMonitor.getCurrentStats());
    } else if (message.action === 'resetPageStats') {
        pageActivityMonitor.resetCounters();
        sendResponse({ success: true });
    }
    return true;
});

console.log('🔍 Content script loaded for page activity monitoring');