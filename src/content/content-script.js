class PageActivityMonitor {
  /* ───────────────────────── Initialisation ─────────────────────── */
  constructor () {
    /* Timing */
    this.startTime        = Date.now();
    this.lastActivityTime = Date.now();

    /* Event counters */
    this.scrollCount    = 0;
    this.clickCount     = 0;
    this.keystrokes     = 0;
    this.mousemoveCount = 0;

    /* Page-level state */
    this.isPageVisible  = !document.hidden;
    this.activityBuffer = [];

    /* Reporting config */
    this.reportingInterval = 30_000;           // 30 s
    this.reportingTimer    = null;

    /* Research metrics container */
    this.browserMetrics = {
      eventCapture: {
        scrollEvents:   0,
        clickEvents:    0,
        keyEvents:      0,
        mouseMoveEvents: 0
      },
      performance: {
        eventProcessingTimes: [],   // {type,time,ts}
        reportingTimes:       [],   // {reportingTime,ts}
        messagingLatency:     []    // {latency,ts}
      },
      interactionPatterns: {
        scrollSpeeds:   [],         // {scrollY,speed,ts}
        clickPositions: [],         // {x,y,element,ts}
        keyboardActivity: [],       // {code,ts}
        keyboardKeyUpActivity: [],  // {code,ts}
        mouseMovements: []          // {x,y,distance,ts}
      },
      engagement: {
        interactionFrequency: []    // {frequency,ts}
      }
    };

    /* Bindings */
    this.limitArraySize = this.limitArraySize.bind(this);

    /* Launch monitoring */
    this.init();
  }

  /* ─────────────────────────── Set-up ───────────────────────────── */
  init () {
    this.setupEventListeners();
    this.startReporting();
    console.log('📊 Page Activity Monitor initialised on:', window.location.hostname);
  }

  setupEventListeners () {
    /* Tab identifier (per-tab session key) */
    if (!window.name) window.name = crypto.randomUUID();

    /* Visibility events */
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      navigator.serviceWorker.controller?.postMessage({
        type: 'VISIBILITY_CHANGE',
        tabID: window.name,
        visibilityState: document.visibilityState,
        timestamp: Date.now()
      });
    });

    /* Scroll tracking (throttled) */
    this.prevScrollY         = window.scrollY;
    this.prevScrollTimestamp = Date.now();
    let lastScrollRunTime    = 0;
    const scrollThrottleMs   = 150;

    window.addEventListener('scroll', event => {
      const now = Date.now();
      if (now - lastScrollRunTime < scrollThrottleMs) return;
      lastScrollRunTime = now;

      const eventStart = performance.now();
      const deltaY     = window.scrollY - this.prevScrollY;
      const deltaTime  = (now - this.prevScrollTimestamp) / 1000;
      const speed      = deltaTime > 0 ? deltaY / deltaTime : 0;

      /* Counters */
      this.scrollCount++;
      this.browserMetrics.eventCapture.scrollEvents++;

      /* Pattern array */
      const data = { scrollY: window.scrollY, speed, timestamp: now };
      this.browserMetrics.interactionPatterns.scrollSpeeds.push(data);
      this.recordActivity('scroll', data);

      /* Perf */
      this.browserMetrics.performance.eventProcessingTimes.push({
        type: 'scroll',
        time: performance.now() - eventStart,
        timestamp: now
      });

      /* Broadcast */
      navigator.serviceWorker.controller?.postMessage({
        type: 'INTERACTION_EVENT',
        tabID: window.name,
        eventType: 'scroll',
        timestamp: now,
        details: data
      });

      /* Update previous state */
      this.prevScrollY         = window.scrollY;
      this.prevScrollTimestamp = now;
    }, { passive: true });

    /* Click tracking */
    document.addEventListener('click', event => {
      const now        = Date.now();
      const eventStart = performance.now();

      this.clickCount++;
      this.browserMetrics.eventCapture.clickEvents++;

      const data = {
        x: event.clientX,
        y: event.clientY,
        element: event.target.tagName,
        timestamp: now
      };
      this.browserMetrics.interactionPatterns.clickPositions.push(data);
      this.recordActivity('click', data);

      this.browserMetrics.performance.eventProcessingTimes.push({
        type: 'click',
        time: performance.now() - eventStart,
        timestamp: now
      });

      navigator.serviceWorker.controller?.postMessage({
        type: 'INTERACTION_EVENT',
        tabID: window.name,
        eventType: 'click',
        timestamp: now,
        details: data
      });
    }, { passive: true });

    /* Keyboard tracking (keydown + keyup for hold duration) */
    document.addEventListener('keydown', event => {
      const now        = Date.now();
      const eventStart = performance.now();

      this.keystrokes++;
      this.browserMetrics.eventCapture.keyEvents++;

      const data = { code: event.code, timestamp: now };
      this.browserMetrics.interactionPatterns.keyboardActivity.push(data);
      this.recordActivity('keydown', data);

      this.browserMetrics.performance.eventProcessingTimes.push({
        type: 'keydown',
        time: performance.now() - eventStart,
        timestamp: now
      });

      navigator.serviceWorker.controller?.postMessage({
        type: 'INTERACTION_EVENT',
        tabID: window.name,
        eventType: 'keydown',
        timestamp: now,
        details: data
      });
    }, { passive: true });

    document.addEventListener('keyup', event => {
      const now = Date.now();
      this.browserMetrics.interactionPatterns.keyboardKeyUpActivity.push({
        code: event.code,
        timestamp: now
      });
    }, { passive: true });

    /* Mouse-move tracking (throttled) */
    let lastMouseMoveRunTime = 0;
    const mouseThrottleMs    = 100;
    let lastMousePos         = { x: 0, y: 0 };

    document.addEventListener('mousemove', event => {
      const now = Date.now();
      if (now - lastMouseMoveRunTime < mouseThrottleMs) return;
      lastMouseMoveRunTime = now;

      const eventStart = performance.now();
      this.mousemoveCount++;
      this.browserMetrics.eventCapture.mouseMoveEvents++;

      const distance = Math.hypot(event.clientX - lastMousePos.x, event.clientY - lastMousePos.y);
      const data = { x: event.clientX, y: event.clientY, distance, timestamp: now };

      this.browserMetrics.interactionPatterns.mouseMovements.push(data);
      this.recordActivity('mousemove', data);

      this.browserMetrics.performance.eventProcessingTimes.push({
        type: 'mousemove',
        time: performance.now() - eventStart,
        timestamp: now
      });

      navigator.serviceWorker.controller?.postMessage({
        type: 'INTERACTION_EVENT',
        tabID: window.name,
        eventType: 'mousemove',
        timestamp: now,
        details: data
      });

      lastMousePos = { x: event.clientX, y: event.clientY };
    }, { passive: true });

    /* Final flush */
    window.addEventListener('beforeunload', () => this.reportFinalStats());
  }

  /* ─────────────────────── Periodic Reporting ───────────────────── */
  async startReporting () {
    if (this.reportingTimer) clearTimeout(this.reportingTimer);

    const loop = async () => {
      await this.reportPeriodicStats();
      this.reportingTimer = setTimeout(loop, this.reportingInterval);
    };

    /* Kick-off immediately */
    await this.reportPeriodicStats();
    this.reportingTimer = setTimeout(loop, this.reportingInterval);

    /* Clear on unload */
    window.addEventListener('beforeunload', () => {
      clearTimeout(this.reportingTimer);
      this.reportingTimer = null;
    });
  }

  async reportPeriodicStats () {
    const t0  = performance.now();
    const now = Date.now();

    /* Engagement calc */
    const timeOnPage          = now - this.startTime;
    const timeSinceLast       = now - this.lastActivityTime;
    const interactionCount    = this.scrollCount + this.clickCount + this.keystrokes + this.mousemoveCount;
    const interactionFrequency = interactionCount / Math.max(timeOnPage / 1000, 1);

    this.browserMetrics.engagement.interactionFrequency.push({ timestamp: now, frequency: interactionFrequency });

    const stats = {
      tabID: window.name,
      domain: window.location.hostname,
      url: window.location.href,
      timestamp: now,
      timeOnPage,
      timeSinceLastActivity: timeSinceLast,
      isVisible: this.isPageVisible,

      interactionCounts: {
        scrolls:   this.scrollCount,
        clicks:    this.clickCount,
        keystrokes:this.keystrokes,
        mouseMoves:this.mousemoveCount
      },

      interactionFrequency,

      browserMetrics: {
        eventCapture: { ...this.browserMetrics.eventCapture },
        performance: {
          averageEventProcessingTime: this.calculateMean(
            this.browserMetrics.performance.eventProcessingTimes.map(e => e.time)
          ),
          totalEventProcessingOperations: this.browserMetrics.performance.eventProcessingTimes.length,
          reportingLatency: null
        }
      }
    };

    /* Post to service-worker */
    const sendT0 = performance.now();
    try {
      await navigator.serviceWorker.controller?.postMessage({
        type: 'PERIODIC_STATS',
        tabID: window.name,
        data: stats
      });

      const latency = performance.now() - sendT0;
      stats.browserMetrics.performance.reportingLatency = latency;
      this.browserMetrics.performance.messagingLatency.push({ timestamp: now, latency });
    } catch (err) {
      console.warn('PERIODIC_STATS send failed:', err);
    }

    /* Perf bookkeeping */
    this.browserMetrics.performance.reportingTimes.push({
      timestamp: now,
      reportingTime: performance.now() - t0
    });

    /* Memory hygiene */
    this.limitArraySize(this.browserMetrics.performance.eventProcessingTimes, 1000);
    this.limitArraySize(this.browserMetrics.performance.reportingTimes,       100);
    this.limitArraySize(this.browserMetrics.performance.messagingLatency,     100);
    this.limitArraySize(this.browserMetrics.interactionPatterns.clickPositions,   500);
    this.limitArraySize(this.browserMetrics.interactionPatterns.keyboardActivity, 500);
    this.limitArraySize(this.browserMetrics.interactionPatterns.mouseMovements,  500);
    this.limitArraySize(this.browserMetrics.interactionPatterns.scrollSpeeds,    500);
    this.limitArraySize(this.browserMetrics.engagement.interactionFrequency,     100);

    /* Reset interval counters */
    this.resetCounters();
  }

  reportFinalStats () {
    const now = Date.now();
    const timeOnPage          = now - this.startTime;
    const timeSinceLast       = now - this.lastActivityTime;
    const interactionCount    = this.scrollCount + this.clickCount + this.keystrokes + this.mousemoveCount;
    const interactionFrequency = interactionCount / Math.max(timeOnPage / 1000, 1);

    const stats = {
      tabID: window.name,
      url: window.location.href,
      hostname: window.location.hostname,
      timestamp: now,
      timeOnPage,
      timeSinceLastActivity: timeSinceLast,
      interactionCounts: {
        scrolls:   this.scrollCount,
        clicks:    this.clickCount,
        keystrokes:this.keystrokes,
        mouseMoves:this.mousemoveCount
      },
      interactionFrequency,
      isVisible: this.isPageVisible,
      activityScore: this.calculateActivityScore(),
      browserMetrics: { ...this.browserMetrics }
    };

    try {
      chrome.runtime.sendMessage({ action: 'finalStats', stats });
    } catch (err) {
      console.warn('finalStats send failed:', err);
    }
  }

  /* ───────────────────── Utilities & Helpers ────────────────────── */
  calculateActivityScore () {
    const minutes = Math.max((Date.now() - this.startTime) / 60_000, 1);
    const score   = (this.scrollCount + this.clickCount + this.keystrokes) / minutes;
    return Math.round(score * 10) / 10;
  }

  recordActivity (type, details = {}) {
    const activity = { type, timestamp: Date.now(), ...details };
    this.activityBuffer.push(activity);
    this.lastActivityTime = activity.timestamp;
    if (this.activityBuffer.length > 500) this.activityBuffer.shift();
  }

  resetCounters () {
    this.scrollCount    = 0;
    this.clickCount     = 0;
    this.keystrokes     = 0;
    this.mousemoveCount = 0;
  }

  limitArraySize (arr, max) {
    if (arr.length > max) arr.splice(0, arr.length - max);
  }

  calculateMean (vals) {
    if (!vals.length) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  groupEventProcessingByType () {
    const grouped = {};
    this.browserMetrics.performance.eventProcessingTimes.forEach(e => {
      (grouped[e.type] = grouped[e.type] || []).push(e.time);
    });
    Object.keys(grouped).forEach(t => {
      const list = grouped[t];
      grouped[t] = {
        count:   list.length,
        average: this.calculateMean(list),
        min:     Math.min(...list),
        max:     Math.max(...list)
      };
    });
    return grouped;
  }

  /* ───── Pattern analysers (lightweight — extend as needed) ────── */
  analyzeScrollSpeeds () {
    const list = this.browserMetrics.interactionPatterns.scrollSpeeds;
    if (!list.length) return null;
    const speeds = list.map(s => Math.abs(s.speed));
    return {
      totalScrollEvents: list.length,
      averageSpeed: this.calculateMean(speeds),
      maxSpeed: Math.max(...speeds),
      minSpeed: Math.min(...speeds),
      frequency: list.length / Math.max((Date.now() - this.startTime) / 1000, 1)
    };
  }

  analyzeClickPatterns () {
    const list = this.browserMetrics.interactionPatterns.clickPositions;
    if (!list.length) return null;
    return {
      totalClicks: list.length,
      averageX: this.calculateMean(list.map(p => p.x)),
      averageY: this.calculateMean(list.map(p => p.y)),
      frequency: list.length / Math.max((Date.now() - this.startTime) / 1000, 1),
      elementDistribution: list.reduce((acc, p) => {
        acc[p.element] = (acc[p.element] || 0) + 1; return acc;
      }, {})
    };
  }

  analyzeKeyboardPatterns () {
    const down = this.browserMetrics.interactionPatterns.keyboardActivity;
    if (!down.length) return null;

    /* Key-code distribution */
    const freq = {}; down.forEach(e => { freq[e.code] = (freq[e.code] || 0) + 1; });

    /* Inter-keystroke intervals */
    const intervals = [];
    for (let i = 1; i < down.length; i++) intervals.push(down[i].timestamp - down[i - 1].timestamp);

    /* Hold duration estimation */
    const up   = this.browserMetrics.interactionPatterns.keyboardKeyUpActivity;
    const downMap = new Map();          // code → queue of ts
    down.forEach(e => {
      if (!downMap.has(e.code)) downMap.set(e.code, []);
      downMap.get(e.code).push(e.timestamp);
    });
    const holds = [];
    up.forEach(u => {
      const q = downMap.get(u.code);
      if (q?.length) holds.push(u.timestamp - q.shift());
    });

    return {
      totalKeystrokes: down.length,
      frequency: down.length / Math.max((Date.now() - this.startTime) / 1000, 1),
      keyCodeFrequency: freq,
      averageIntervalMs: this.calculateMean(intervals),
      errorKeyCount: (freq['Backspace'] || 0) + (freq['Delete'] || 0),
      averageHoldMs: this.calculateMean(holds),
      specialKeyUsage: ['Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']
        .reduce((o,k) => (o[k] = freq[k] || 0, o), {})
    };
  }

  analyzeMouseMovements () {
    const list = this.browserMetrics.interactionPatterns.mouseMovements;
    if (!list.length) return null;
    const dist = list.map(m => m.distance);
    return {
      totalMovements: list.length,
      averageDistance: this.calculateMean(dist),
      totalDistance: dist.reduce((s,d) => s + d, 0),
      frequency: list.length / Math.max((Date.now() - this.startTime) / 1000, 1)
    };
  }

  /* ─────────── Public getters (for popup / debugging) ──────────── */
  getBrowserMetrics () {
    return {
      eventCapture: { ...this.browserMetrics.eventCapture },
      performance: {
        eventProcessingSummary: {
          total: this.browserMetrics.performance.eventProcessingTimes.length,
          averageTime: this.calculateMean(
            this.browserMetrics.performance.eventProcessingTimes.map(e => e.time)
          ),
          byEventType: this.groupEventProcessingByType()
        },
        reportingSummary: {
          total: this.browserMetrics.performance.reportingTimes.length,
          averageTime: this.calculateMean(
            this.browserMetrics.performance.reportingTimes.map(r => r.reportingTime)
          )
        },
        messagingSummary: {
          total: this.browserMetrics.performance.messagingLatency.length,
          averageLatency: this.calculateMean(
            this.browserMetrics.performance.messagingLatency.map(m => m.latency)
          )
        }
      },
      interactionPatterns: {
        scroll:  this.analyzeScrollSpeeds(),
        clicks:  this.analyzeClickPatterns(),
        keyboard:this.analyzeKeyboardPatterns(),
        mouse:   this.analyzeMouseMovements()
      },
      engagement: {
        interactionFrequency: [ ...this.browserMetrics.engagement.interactionFrequency ]
      }
    };
  }

  getCurrentStats () {
    return {
      timeOnPage: Date.now() - this.startTime,
      scrollCount: this.scrollCount,
      clickCount: this.clickCount,
      keystrokes: this.keystrokes,
      mousemoveCount: this.mousemoveCount,
      isVisible: this.isPageVisible,
      activityScore: this.calculateActivityScore(),
      browserMetrics: this.getBrowserMetrics()
    };
  }

  /* ──────────── Settings / control (optional use) ─────────────── */
  stopMonitoring () { clearTimeout(this.reportingTimer); }
  resumeMonitoring () { this.startReporting(); }

  updateSettings (opts = {}) {
    if (opts.reportingInterval && Number.isFinite(opts.reportingInterval)) {
      this.reportingInterval = Math.max(5_000, opts.reportingInterval);
      this.stopMonitoring(); this.resumeMonitoring();
    }
  }
}

/* ───────────────────── Global instance & messaging ────────────── */
const pageActivityMonitor = new PageActivityMonitor();
window.pageActivityMonitor = pageActivityMonitor;

/* Popup / background requests */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'getPageStats':       sendResponse(pageActivityMonitor.getCurrentStats()); break;
    case 'getBrowserMetrics':  sendResponse(pageActivityMonitor.getBrowserMetrics()); break;
    case 'resetPageStats':     pageActivityMonitor.resetCounters(); sendResponse({ success: true }); break;
    case 'getActivityScore':   sendResponse({ score: pageActivityMonitor.calculateActivityScore() }); break;
    case 'pauseMonitoring':    pageActivityMonitor.stopMonitoring(); sendResponse({ success: true }); break;
    case 'resumeMonitoring':   pageActivityMonitor.resumeMonitoring(); sendResponse({ success: true }); break;
    case 'updateSettings':     pageActivityMonitor.updateSettings(msg.settings); sendResponse({ success: true }); break;
    default: return; // unrecognised
  }
  return true; // allow async
});

console.log('🔍 Content script loaded – comprehensive page-activity monitoring active.');
