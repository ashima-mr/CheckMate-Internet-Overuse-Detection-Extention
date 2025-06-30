/**
 * Content Script for Internet Overuse Detection
 * MODIFIED: Added comprehensive browser integration metrics collection
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

        // ADDED: Comprehensive browser integration metrics
        this.browserMetrics = {
            // Event capture tracking for research validation
            eventCapture: {
                scrollEvents: 0,
                clickEvents: 0,
                keyEvents: 0,
                focusEvents: 0,
                visibilityEvents: 0,
                mouseMoveEvents: 0
            },
            
            // Performance tracking
            performance: {
                eventProcessingTimes: [],
                reportingTimes: [],
                messagingLatency: []
            },
            
            // User interaction patterns
            interactionPatterns: {
                scrollSpeeds: [],
                clickPositions: [],
                keyboardActivity: [],
                mouseMovements: []
            },
            
            // Page engagement metrics
            engagement: {
                timeSpentVisible: 0,
                timeSpentHidden: 0,
                lastVisibilityChange: Date.now(),
                interactionFrequency: []
            }
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startReporting();
        console.log('📊 Page Activity Monitor initialized on:', window.location.hostname);
    }

    /**
     * Enhanced event listeners with comprehensive metrics collection
     * MODIFIED: Added detailed event capture and performance tracking
     */
    setupEventListeners() {
        // ADDED: Scroll tracking with enhanced metrics
        let scrollTimeout;
        window.addEventListener('scroll', (event) => {
            const eventStartTime = performance.now();
            
            this.scrollCount++;
            this.browserMetrics.eventCapture.scrollEvents++;
            
            this.recordActivity('scroll', {
                scrollY: window.scrollY,
                timestamp: Date.now()
            });
            
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.reportScrollBehavior();
            }, 1000);

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'scroll',
                time: processingTime,
                timestamp: Date.now()
            });
            
        }, { passive: true });

        // ADDED: Enhanced click tracking with position metrics
        document.addEventListener('click', (event) => {
            const eventStartTime = performance.now();
            
            this.clickCount++;
            this.browserMetrics.eventCapture.clickEvents++;
            
            // ADDED: Track click positions for interaction pattern analysis
            this.browserMetrics.interactionPatterns.clickPositions.push({
                x: event.clientX,
                y: event.clientY,
                element: event.target.tagName,
                timestamp: Date.now()
            });
            
            this.recordActivity('click', {
                element: event.target.tagName,
                x: event.clientX,
                y: event.clientY,
                timestamp: Date.now()
            });

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'click',
                time: processingTime,
                timestamp: Date.now()
            });
            
        }, { passive: true });

        // ADDED: Enhanced keyboard tracking with timing patterns
        document.addEventListener('keydown', (event) => {
            const eventStartTime = performance.now();
            
            this.keystrokes++;
            this.browserMetrics.eventCapture.keyEvents++;
            
            // ADDED: Track keyboard activity patterns (no content, just timing)
            this.browserMetrics.interactionPatterns.keyboardActivity.push({
                timestamp: Date.now(),
                keyCode: event.keyCode,
                isModifier: event.ctrlKey || event.altKey || event.shiftKey
            });
            
            this.recordActivity('keydown');

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'keydown',
                time: processingTime,
                timestamp: Date.now()
            });
            
        }, { passive: true });

        // ADDED: Enhanced focus tracking with engagement metrics
        window.addEventListener('focus', () => {
            const eventStartTime = performance.now();
            
            this.isPageVisible = true;
            this.browserMetrics.eventCapture.focusEvents++;
            
            // ADDED: Track engagement timing
            const now = Date.now();
            if (this.browserMetrics.engagement.lastVisibilityChange) {
                this.browserMetrics.engagement.timeSpentHidden += 
                    now - this.browserMetrics.engagement.lastVisibilityChange;
            }
            this.browserMetrics.engagement.lastVisibilityChange = now;
            
            this.recordActivity('focus');

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'focus',
                time: processingTime,
                timestamp: Date.now()
            });
        });

        window.addEventListener('blur', () => {
            const eventStartTime = performance.now();
            
            this.isPageVisible = false;
            this.browserMetrics.eventCapture.focusEvents++;
            
            // ADDED: Track engagement timing
            const now = Date.now();
            if (this.browserMetrics.engagement.lastVisibilityChange) {
                this.browserMetrics.engagement.timeSpentVisible += 
                    now - this.browserMetrics.engagement.lastVisibilityChange;
            }
            this.browserMetrics.engagement.lastVisibilityChange = now;
            
            this.recordActivity('blur');

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'blur',
                time: processingTime,
                timestamp: Date.now()
            });
        });

        // ADDED: Enhanced page visibility tracking
        document.addEventListener('visibilitychange', () => {
            const eventStartTime = performance.now();
            
            this.isPageVisible = !document.hidden;
            this.browserMetrics.eventCapture.visibilityEvents++;
            
            // ADDED: Track detailed visibility metrics
            const now = Date.now();
            if (this.browserMetrics.engagement.lastVisibilityChange) {
                if (this.isPageVisible) {
                    this.browserMetrics.engagement.timeSpentHidden += 
                        now - this.browserMetrics.engagement.lastVisibilityChange;
                } else {
                    this.browserMetrics.engagement.timeSpentVisible += 
                        now - this.browserMetrics.engagement.lastVisibilityChange;
                }
            }
            this.browserMetrics.engagement.lastVisibilityChange = now;
            
            this.recordActivity('visibilitychange', {
                visible: this.isPageVisible,
                timestamp: now
            });

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'visibilitychange',
                time: processingTime,
                timestamp: Date.now()
            });
        });

        // ADDED: Mouse movement tracking (throttled) with pattern analysis
        let mouseMoveTimeout;
        let lastMousePosition = { x: 0, y: 0 };
        
        document.addEventListener('mousemove', (event) => {
            const eventStartTime = performance.now();
            
            this.browserMetrics.eventCapture.mouseMoveEvents++;
            
            // ADDED: Track mouse movement patterns
            const distance = Math.sqrt(
                Math.pow(event.clientX - lastMousePosition.x, 2) + 
                Math.pow(event.clientY - lastMousePosition.y, 2)
            );
            
            this.browserMetrics.interactionPatterns.mouseMovements.push({
                x: event.clientX,
                y: event.clientY,
                distance: distance,
                timestamp: Date.now()
            });
            
            lastMousePosition = { x: event.clientX, y: event.clientY };
            
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = setTimeout(() => {
                this.recordActivity('mousemove');
            }, 5000); // Only record every 5 seconds

            // ADDED: Track event processing time
            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'mousemove',
                time: processingTime,
                timestamp: Date.now()
            });
            
        }, { passive: true });

        // Page unload with final metrics
        window.addEventListener('beforeunload', () => {
            this.reportFinalStats();
        });
    }

    /**
     * Enhanced periodic reporting with performance metrics
     * MODIFIED: Added comprehensive reporting timing and browser integration stats
     */
    reportPeriodicStats() {
        // ADDED: Track reporting performance
        const reportingStartTime = performance.now();
        
        const now = Date.now();
        const timeOnPage = now - this.startTime;
        const timeSinceLastActivity = now - this.lastActivityTime;

        // ADDED: Calculate interaction frequency
        const interactionCount = this.scrollCount + this.clickCount + this.keystrokes;
        const interactionFrequency = interactionCount / (timeOnPage / 1000); // per second
        this.browserMetrics.engagement.interactionFrequency.push({
            timestamp: now,
            frequency: interactionFrequency
        });

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
            timestamp: now,
            
            // ADDED: Include browser integration metrics
            browserMetrics: {
                eventCapture: { ...this.browserMetrics.eventCapture },
                engagement: {
                    timeSpentVisible: this.browserMetrics.engagement.timeSpentVisible,
                    timeSpentHidden: this.browserMetrics.engagement.timeSpentHidden,
                    visibilityRatio: this.browserMetrics.engagement.timeSpentVisible / 
                        (this.browserMetrics.engagement.timeSpentVisible + this.browserMetrics.engagement.timeSpentHidden),
                    currentInteractionFrequency: interactionFrequency
                },
                performance: {
                    averageEventProcessingTime: this.calculateMean(
                        this.browserMetrics.performance.eventProcessingTimes.map(e => e.time)
                    ),
                    totalEventProcessingOperations: this.browserMetrics.performance.eventProcessingTimes.length
                }
            }
        };

        // ADDED: Track messaging latency
        const messagingStartTime = performance.now();
        
        this.sendToBackground({
            type: 'page_activity',
            data: stats
        }).then(() => {
            // ADDED: Record messaging latency
            const messagingTime = performance.now() - messagingStartTime;
            this.browserMetrics.performance.messagingLatency.push({
                timestamp: now,
                latency: messagingTime
            });
        });

        // Reset counters for next period
        this.resetCounters();

        // ADDED: Record reporting time
        const reportingTime = performance.now() - reportingStartTime;
        this.browserMetrics.performance.reportingTimes.push({
            timestamp: now,
            reportingTime: reportingTime
        });

        // Keep performance arrays manageable
        this.limitArraySize(this.browserMetrics.performance.eventProcessingTimes, 1000);
        this.limitArraySize(this.browserMetrics.performance.reportingTimes, 100);
        this.limitArraySize(this.browserMetrics.performance.messagingLatency, 100);
        this.limitArraySize(this.browserMetrics.interactionPatterns.clickPositions, 500);
        this.limitArraySize(this.browserMetrics.interactionPatterns.keyboardActivity, 500);
        this.limitArraySize(this.browserMetrics.interactionPatterns.mouseMovements, 500);
        this.limitArraySize(this.browserMetrics.engagement.interactionFrequency, 100);
    }

    // ADDED: Helper method to limit array sizes
    limitArraySize(array, maxSize) {
        while (array.length > maxSize) {
            array.shift();
        }
    }

    // ADDED: Helper method to calculate mean
    calculateMean(values) {
        if (!values || values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Enhanced message sending with performance tracking
     * MODIFIED: Added promise-based messaging with latency tracking
     */
    sendToBackground(message) {
        return new Promise((resolve, reject) => {
            try {
                const sendStartTime = performance.now();
                
                chrome.runtime.sendMessage(message).then((response) => {
                    const sendTime = performance.now() - sendStartTime;
                    
                    // ADDED: Track messaging performance
                    this.browserMetrics.performance.messagingLatency.push({
                        timestamp: Date.now(),
                        latency: sendTime,
                        messageType: message.type
                    });
                    
                    resolve(response);
                }).catch(error => {
                    // Service worker might be inactive, ignore errors
                    console.debug('Background message failed:', error);
                    reject(error);
                });
            } catch (error) {
                console.debug('Runtime message error:', error);
                reject(error);
            }
        });
    }

    // ADDED: Get comprehensive browser integration metrics
    getBrowserMetrics() {
        return {
            eventCapture: { ...this.browserMetrics.eventCapture },
            performance: {
                eventProcessing: {
                    totalOperations: this.browserMetrics.performance.eventProcessingTimes.length,
                    averageTime: this.calculateMean(
                        this.browserMetrics.performance.eventProcessingTimes.map(e => e.time)
                    ),
                    byEventType: this.groupEventProcessingByType()
                },
                reporting: {
                    totalReports: this.browserMetrics.performance.reportingTimes.length,
                    averageTime: this.calculateMean(
                        this.browserMetrics.performance.reportingTimes.map(r => r.reportingTime)
                    )
                },
                messaging: {
                    totalMessages: this.browserMetrics.performance.messagingLatency.length,
                    averageLatency: this.calculateMean(
                        this.browserMetrics.performance.messagingLatency.map(m => m.latency)
                    )
                }
            },
            interactionPatterns: {
                clickPatternAnalysis: this.analyzeClickPatterns(),
                keyboardPatternAnalysis: this.analyzeKeyboardPatterns(),
                mouseMovementAnalysis: this.analyzeMouseMovements()
            },
            engagement: {
                ...this.browserMetrics.engagement,
                totalEngagementTime: this.browserMetrics.engagement.timeSpentVisible,
                engagementRatio: this.browserMetrics.engagement.timeSpentVisible / 
                    (Date.now() - this.startTime)
            }
        };
    }

    // ADDED: Group event processing times by type
    groupEventProcessingByType() {
        const grouped = {};
        this.browserMetrics.performance.eventProcessingTimes.forEach(event => {
            if (!grouped[event.type]) {
                grouped[event.type] = [];
            }
            grouped[event.type].push(event.time);
        });

        // Calculate statistics for each event type
        Object.keys(grouped).forEach(type => {
            const times = grouped[type];
            grouped[type] = {
                count: times.length,
                average: this.calculateMean(times),
                min: Math.min(...times),
                max: Math.max(...times)
            };
        });

        return grouped;
    }

    // ADDED: Analyze click patterns
    analyzeClickPatterns() {
        const positions = this.browserMetrics.interactionPatterns.clickPositions;
        if (positions.length === 0) return null;

        return {
            totalClicks: positions.length,
            averageX: this.calculateMean(positions.map(p => p.x)),
            averageY: this.calculateMean(positions.map(p => p.y)),
            clickFrequency: positions.length / ((Date.now() - this.startTime) / 1000),
            elementDistribution: this.countElementTypes(positions)
        };
    }

    // ADDED: Analyze keyboard patterns
    analyzeKeyboardPatterns() {
        const activity = this.browserMetrics.interactionPatterns.keyboardActivity;
        if (activity.length === 0) return null;

        return {
            totalKeystrokes: activity.length,
            keystrokeFrequency: activity.length / ((Date.now() - this.startTime) / 1000),
            modifierKeyUsage: activity.filter(a => a.isModifier).length / activity.length
        };
    }

    // ADDED: Analyze mouse movements
    analyzeMouseMovements() {
        const movements = this.browserMetrics.interactionPatterns.mouseMovements;
        if (movements.length === 0) return null;

        const distances = movements.map(m => m.distance);
        return {
            totalMovements: movements.length,
            averageDistance: this.calculateMean(distances),
            totalDistance: distances.reduce((sum, d) => sum + d, 0),
            movementFrequency: movements.length / ((Date.now() - this.startTime) / 1000)
        };
    }

    // ADDED: Count element types in click positions
    countElementTypes(positions) {
        const counts = {};
        positions.forEach(pos => {
            counts[pos.element] = (counts[pos.element] || 0) + 1;
        });
        return counts;
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
            engagementLevel: this.calculateEngagementLevel(),
            
            // ADDED: Include browser integration metrics
            browserMetrics: this.getBrowserMetrics()
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

// ADDED: Enhanced message handling for research metrics
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageStats') {
        sendResponse(pageActivityMonitor.getCurrentStats());
    } else if (message.action === 'resetPageStats') {
        pageActivityMonitor.resetCounters();
        sendResponse({ success: true });
    } else if (message.action === 'getBrowserMetrics') {
        // ADDED: New action for browser integration metrics
        sendResponse(pageActivityMonitor.getBrowserMetrics());
    }

    return true;
});

console.log('🔍 Content script loaded for comprehensive page activity monitoring and research metrics');