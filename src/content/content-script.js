class PageActivityMonitor {
  constructor() {
    this.startTime = Date.now();              // When the page session started
    this.lastActivityTime = Date.now();       // Last time user interacted with the page
    this.scrollCount = 0;                     // Number of scroll events
    this.clickCount = 0;                      // Number of click events
    this.keystrokes = 0;                      // Number of keydown events
    this.mousemoveCount = 0;                  
    this.activityBuffer = [];                 // Buffer for recent activity events
    this.reportingInterval = 30000;           // How often to report stats (30s)
    this.reportingTimer = null;               // Reference to reporting interval

    // Metrics for research and system evaluation
    this.browserMetrics = {
      eventCapture: {                         // Counts for each event type
        scrollEvents: 0,
        clickEvents: 0,
        keyEvents: 0,
        mouseMoveEvents: 0
      },
      performance: {                          // Timing and latency metrics
        eventProcessingTimes: [],
        reportingTimes: [],
        messagingLatency: []
      },
      interactionPatterns: {                  // Patterns for advanced analysis
        scrollSpeeds: [],
        clickPositions: [],
        keyboardActivity: [],
        mouseMovements: []
      },
      engagement: {          
        interactionFrequency: []
      }
    };

    this.init();                              // Set up event listeners and reporting
  }

    init() {
        this.setupEventListeners();
        this.startReporting();
        console.log('📊 Page Activity Monitor initialized on:', window.location.hostname);
    }

    setupEventListeners() {

        if (!window.name) {
            window.name = crypto.randomUUID();
        }

        // Send visibility state changes to service worker
        document.addEventListener('visibilitychange', () => {
            navigator.serviceWorker.controller?.postMessage({
                type: 'VISIBILITY_CHANGE',
                tabID: window.name || null, // or generate a unique ID per tab if needed
                visibilityState: document.visibilityState,
                timestamp: Date.now()
            });
        });

        this.prevScrollY = window.scrollY;
        this.prevScrollTimestamp = Date.now();

        let lastscrollRunTime = 0;             // Track last time handler ran
        const scrollthrottleDelay = 150;      // 150ms throttle delay

        window.addEventListener('scroll', (event) => {
            const now = Date.now();

            if (now - lastscrollRunTime >= scrollthrottleDelay) {
                lastscrollRunTime = now;

                const eventStartTime = performance.now();

                const currentScrollY = window.scrollY;
                const currentTimestamp = now;

                const deltaY = currentScrollY - this.prevScrollY;
                const deltaTime = (currentTimestamp - this.prevScrollTimestamp) / 1000; // seconds
                const scrollSpeed = deltaTime > 0 ? deltaY / deltaTime : 0;

                this.scrollCount++;
                this.browserMetrics.eventCapture.scrollEvents++;

                const scrollData = {
                    scrollY: currentScrollY,
                    timestamp: currentTimestamp,
                    speed: scrollSpeed
                };

                this.browserMetrics.interactionPatterns.scrollSpeeds.push(scrollData);
                this.recordActivity('scroll', scrollData);

                this.prevScrollY = currentScrollY;
                this.prevScrollTimestamp = currentTimestamp;

                const processingTime = performance.now() - eventStartTime;
                this.browserMetrics.performance.eventProcessingTimes.push({
                    type: 'scroll',
                    time: processingTime,
                    timestamp: Date.now()
                });

                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'INTERACTION_EVENT',
                        tabID: window.name || null,
                        eventType: 'scroll',
                        timestamp: currentTimestamp,
                        details: {
                            scrollY: currentScrollY,
                            speed: scrollSpeed
                        }
                    });
                }
            }
        }, { passive: true });

        // click tracking with position metrics
        document.addEventListener('click', (event) => {
            const eventStartTime = performance.now();
            
            this.clickCount++;
            this.browserMetrics.eventCapture.clickEvents++;
            
            const clickData = {
                x: event.clientX,
                y: event.clientY,
                element: event.target.tagName,
                timestamp: Date.now()
            }
            this.browserMetrics.interactionPatterns.clickPositions.push({clickData});
            this.recordActivity('click', {clickData});

            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'click',
                time: processingTime,
                timestamp: Date.now()
            });

            if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'INTERACTION_EVENT',
                tabID: window.name || null,
                eventType: 'click',
                timestamp: currentTimestamp,
                details: {
                    x: event.clientX,
                    y: event.clientY,
                    element: event.target.tagName
                }
            });
        }
            
        }, { passive: true });

        document.addEventListener('keydown', (event) => {
            const eventStartTime = performance.now();
            
            this.keystrokes++;
            this.browserMetrics.eventCapture.keyEvents++;
            
            const keyboardData = {
                timestamp: Date.now(),
                code: event.code
            };

            this.browserMetrics.interactionPatterns.keyboardActivity.push(keyboardData);
            this.recordActivity('keydown', keyboardData);

            const processingTime = performance.now() - eventStartTime;
            this.browserMetrics.performance.eventProcessingTimes.push({
                type: 'keydown',
                time: processingTime,
                timestamp: Date.now()
            });

            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'INTERACTION_EVENT',
                    tabID: window.name || null,
                    eventType: 'keydown',
                    timestamp: currentTimestamp,
                    details: {
                        code: event.code
                    }
                });
            }
        }, { passive: true });

        let lastmousemoveRunTime=0;
        const mousethrottleDelay = 100;
        let lastMousePosition = { x: 0, y: 0 };
        
        document.addEventListener('mousemove', (event) => {
            const eventStartTime = performance.now();
            
            if (now - lastmousemoveRunTime >= mousethrottleDelay) {
                lastmousemoveRunTime = now;

                this.mousemoveCount++
                this.browserMetrics.eventCapture.mouseMoveEvents++;
                
                const distance = Math.sqrt(
                    Math.pow(event.clientX - lastMousePosition.x, 2) + 
                    Math.pow(event.clientY - lastMousePosition.y, 2)
                );

                const mouseData = {
                    x: event.clientX,
                    y: event.clientY,
                    distance: distance,
                    timestamp: Date.now()
                }
                
                this.browserMetrics.interactionPatterns.mouseMovements.push({mouseData});
                this.recordActivity('mouseMovement', {mouseData});

                lastMousePosition = { x: event.clientX, y: event.clientY };

                const processingTime = performance.now() - eventStartTime;
                this.browserMetrics.performance.eventProcessingTimes.push({
                    type: 'mousemove',
                    time: processingTime,
                    timestamp: Date.now()
                });

                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'INTERACTION_EVENT',
                        tabID: window.name || null,
                        eventType: 'mousemove',
                        timestamp: currentTimestamp,
                        details: {
                            x: event.clientX,
                            y: event.clientY,
                            distance: distance
                        }
                    });
                }
            }
        }, { passive: true });

        // Listen for page unload event to report final user metrics before the page closes or navigates away
        window.addEventListener('beforeunload', () => {
            this.reportFinalStats();
        });

    }

    async startReporting() {
        if (this.reportingTimer) {
            clearTimeout(this.reportingTimer); // clear prev timer
        }

        const reportAndSchedule = async () => { //helper func
            await this.reportPeriodicStats();  // Wait for report to finish
            this.reportingTimer = setTimeout(reportAndSchedule, this.reportingInterval); // Schedule next after timeout delay
        };

        // Start immediately
        await this.reportPeriodicStats();
        this.reportingTimer = setTimeout(reportAndSchedule, this.reportingInterval); //next reporting cycle

        // Clear on unload
        window.addEventListener('beforeunload', () => {
            if (this.reportingTimer) {
            clearTimeout(this.reportingTimer);
            this.reportingTimer = null;
            }
        });
    }

    async reportPeriodicStats() {
        const reportingStartTime = performance.now();
        const now = Date.now();
        const timeOnPage = now - this.startTime;
        const timeSinceLastActivity = now - this.lastActivityTime;

        // Calculate interaction count + frequency
        const interactionCount = this.scrollCount + this.clickCount + this.keystrokes + this.mousemoveCount;
        const interactionFrequency = interactionCount / (timeOnPage / 1000); // interactions per second

        this.browserMetrics.engagement.interactionFrequency.push({
            timestamp: now,
            frequency: interactionFrequency
        });

        // Create structured stats snapshot
        const stats = {
            tabID: window.name,
            domain: window.location.hostname,
            url: window.location.href,
            timestamp: now,
            timeOnPage,
            timeSinceLastActivity,
            isVisible: this.isPageVisible, // Still valid per tab

            interactionCounts: {
                scrolls: this.scrollCount,
                clicks: this.clickCount,
                keystrokes: this.keystrokes,
                mouseMoves: this.mousemoveCount
            }, //assume interaction is for this one tab

            interactionFrequency,

            browserMetrics: {
                eventCapture: { ...this.browserMetrics.eventCapture },
                performance: {
                    averageEventProcessingTime: this.calculateMean(
                        this.browserMetrics.performance.eventProcessingTimes.map(e => e.time)
                    ),
                    totalEventProcessingOperations: this.browserMetrics.performance.eventProcessingTimes.length,
                    reportingLatency: null // will be set below
                }
            }
        };

        // Send to background script / service worker
        const messagingStartTime = performance.now();
        if (navigator.serviceWorker.controller) { //Checks if a service worker controls this page/tab.
            try {
                await navigator.serviceWorker.controller.postMessage({
                    type: 'PERIODIC_STATS',
                    tabID: window.name,
                    data: stats
                });

                const messagingLatency = performance.now() - messagingStartTime;
                stats.browserMetrics.performance.reportingLatency = messagingLatency;

                this.browserMetrics.performance.messagingLatency.push({
                    timestamp: now,
                    latency: messagingLatency
                });
            } catch (error) {
                console.warn('Failed to send stats to service worker:', error);
            }
        }

        // Log reporting time
        const reportingTime = performance.now() - reportingStartTime;
        this.browserMetrics.performance.reportingTimes.push({
            timestamp: now,
            reportingTime
        });

        // Trim large arrays
        this.limitArraySize(this.browserMetrics.performance.eventProcessingTimes, 1000);
        this.limitArraySize(this.browserMetrics.performance.reportingTimes, 100);
        this.limitArraySize(this.browserMetrics.performance.messagingLatency, 100);
        this.limitArraySize(this.browserMetrics.interactionPatterns.clickPositions, 500);
        this.limitArraySize(this.browserMetrics.interactionPatterns.keyboardActivity, 500);
        this.limitArraySize(this.browserMetrics.interactionPatterns.mouseMovements, 500);
        this.limitArraySize(this.browserMetrics.engagement.interactionFrequency, 100);

        // Reset counters for next reporting window
        this.resetCounters();
    }

    limitArraySize(array, maxSize) {
        while (array.length > maxSize) {
            array.shift();
        }
    }

    calculateMean(values) {
        if (!values || values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    //Get comprehensive browser integration metrics
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
                scrollPatternAnalysis: this.analyzeScrollPatterns(),
                clickPatternAnalysis: this.analyzeClickPatterns(),
                keyboardPatternAnalysis: this.analyzeKeyboardPatterns(),
                mouseMovementAnalysis: this.analyzeMouseMovements()
            },
            engagement: {
                interactionFrequency: [...this.browserMetrics.engagement.interactionFrequency]
            }
        };
    }

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

    analyzeScrollSpeeds() {
        const speeds = this.browserMetrics.interactionPatterns.scrollSpeeds;
        if (speeds.length === 0) return null;

        const speedValues = speeds.map(s => Math.abs(s.speed)); // absolute speeds

        return {
            totalScrollEvents: speeds.length,
            averageSpeed: this.calculateMean(speedValues),  // avg scroll speed (pixels/sec)
            maxSpeed: Math.max(...speedValues),
            minSpeed: Math.min(...speedValues),
            scrollFrequency: speeds.length / ((Date.now() - this.startTime) / 1000)  // scrolls per second
        };
    }

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

    analyzeKeyboardPatternsAdvanced() {
        const activity = this.browserMetrics.interactionPatterns.keyboardActivity;
        const keyUpActivity = this.browserMetrics.interactionPatterns.keyboardKeyUpActivity || [];

        if (activity.length === 0) return null;

        // 1. Key Code Distribution
        const keyCodeFrequency = {};
        for (const entry of activity) {
            keyCodeFrequency[entry.code] = (keyCodeFrequency[entry.code] || 0) + 1;
        }

        // 2. Typing Speed / Burstiness (inter-keystroke intervals)
        const intervals = [];
        for (let i = 1; i < activity.length; i++) {
            intervals.push(activity[i].timestamp - activity[i-1].timestamp);
        }
        const avgInterval = intervals.length ? this.calculateMean(intervals) : null;

        // 3. Error Patterns: count Backspace/Delete usage
        const errorCount = (keyCodeFrequency['Backspace'] || 0) + (keyCodeFrequency['Delete'] || 0);

        // 4. Key Hold Durations (match keydown and keyup by code)
        // Build maps from code to timestamps for keydown and keyup events
        const holdDurations = [];
        const downMap = new Map(); // code -> stack of down timestamps

        for (const downEvent of activity) {
            if (!downMap.has(downEvent.code)) downMap.set(downEvent.code, []);
            downMap.get(downEvent.code).push(downEvent.timestamp);
        }

        // For each keyup, try to match with the earliest unmatched keydown timestamp
        for (const upEvent of keyUpActivity) {
            const stack = downMap.get(upEvent.code);
            if (stack && stack.length > 0) {
                const downTime = stack.shift();
                const duration = upEvent.timestamp - downTime;
                if (duration >= 0) holdDurations.push(duration);
            }
        }
        const avgHoldDuration = holdDurations.length ? this.calculateMean(holdDurations) : null;

        // 5. Special Key Usage (Enter, Arrow keys)
        const specialKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        const specialKeyUsage = {};
        for (const key of specialKeys) {
            specialKeyUsage[key] = keyCodeFrequency[key] || 0;
        }

        // Total keystrokes & frequency
        const totalKeystrokes = activity.length;
        const timeOnPageSec = (Date.now() - this.startTime) / 1000;
        const keystrokeFrequency = totalKeystrokes / timeOnPageSec;

        return {
            totalKeystrokes,
            keystrokeFrequency,
            keyCodeFrequency,
            averageInterKeystrokeIntervalMs: avgInterval,
            errorKeyCount: errorCount,
            averageKeyHoldDurationMs: avgHoldDuration,
            specialKeyUsage
        };
    }

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
            
            browserMetrics: this.getBrowserMetrics()
        };
    }

    calculateActivityScore() {
        // Simple activity score: weighted sum of scrolls, clicks, keystrokes per minute
        const now = Date.now();
        const minutes = Math.max((now - this.startTime) / 60000, 1);
        const score = (this.scrollCount + this.clickCount + this.keystrokes) / minutes;
        return Math.round(score * 10) / 10; // One decimal place
    }

    /**
     * Record a user activity event for metrics and reporting.
     * @param {string} type - The type of activity (e.g., 'scroll', 'click', etc.)
     * @param {object} [details] - Optional details about the activity.
     */
    recordActivity(type, details = {}) {
        const activity = {
            type,
            timestamp: Date.now(),
            ...details
        };
        this.activityBuffer.push(activity);
        this.lastActivityTime = activity.timestamp;
        // Optionally, keep buffer size manageable
        if (this.activityBuffer.length > 500) {
            this.activityBuffer.shift();
        }
    }

    reportFinalStats() {
        // Report final stats before unload (similar to reportPeriodicStats)
        const now = Date.now();
        const timeOnPage = now - this.startTime;
        const timeSinceLastActivity = now - this.lastActivityTime;
        const interactionCount = this.scrollCount + this.clickCount + this.keystrokes;
        const interactionFrequency = interactionCount / (timeOnPage / 1000);
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
            timestamp: now,
            browserMetrics: {
                eventCapture: { ...this.browserMetrics.eventCapture },
                performance: { ...this.browserMetrics.performance },
                interactionPatterns: { ...this.browserMetrics.interactionPatterns },
                engagement: { ...this.browserMetrics.engagement }
            }
        };
        // Send to background or log
        try {
            chrome.runtime.sendMessage({ action: 'finalStats', stats });
        } catch (e) {
            console.warn('Failed to send final stats:', e);
        }
    }
}

// Initialize the monitor
const pageActivityMonitor = new PageActivityMonitor();

// Make it globally accessible for debugging
window.pageActivityMonitor = pageActivityMonitor;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageStats') {
        sendResponse(pageActivityMonitor.getCurrentStats());
    } else if (message.action === 'resetPageStats') {
        pageActivityMonitor.resetCounters();
        sendResponse({ success: true });
    } else if (message.action === 'getBrowserMetrics') {
        sendResponse(pageActivityMonitor.getBrowserMetrics());
    }
    return true; // Indicates async response if needed
});

console.log('🔍 Content script loaded for comprehensive page activity monitoring and research metrics');