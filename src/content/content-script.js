(() => {
  /* ---------------------------- constants ---------------------------- */
  const REPORT_INTERVAL_MS        = 30_000;         // 30 s
  const SCROLL_THROTTLE_MS        = 150;
  const MOUSE_THROTTLE_MS         = 100;
  const VISIBILITY_THROTTLE_MS    = 500;
  const MAX_PERF_SAMPLES          = 1000;
  const MAX_PATTERN_SAMPLES       = 500;
  const MAX_ENGAGEMENT_SAMPLES    = 100;

  /* ----------------------- utility – throttle ------------------------ */
  const throttle = (fn, wait) => {
    let last = 0;
    return function throttled (...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  };

  /* ---------------------- utility – debounce ------------------------- */
  const debounce = (fn, wait) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  /* ---------------- utility – generic event profiler ----------------- */
  function profileEvent (type, handler, perfBuffer) {
    return function wrapped (evt) {
      const t0 = performance.now();
      handler(evt);
      perfBuffer.push({ type, time: performance.now() - t0, ts: Date.now() });
    };
  }

  /* --------------------------- main class --------------------------- */
  class PageActivityMonitor {
    constructor () {
      /* time bookkeeping */
      this.startTime       = Date.now();
      this.lastActivityTs  = this.startTime;

      /* counters */
      this.scrolls = 0; this.clicks = 0; this.keydowns = 0; this.mouseMoves = 0;

      /* state */
      this.isVisible = !document.hidden;
      if (!window.name) window.name = crypto.randomUUID();

      /* buffers – bounded circular storage */
      this.perfTimes   = new CircularBuffer(MAX_PERF_SAMPLES);
      this.scrollBuf   = new CircularBuffer(MAX_PATTERN_SAMPLES);
      this.clickBuf    = new CircularBuffer(MAX_PATTERN_SAMPLES);
      this.keyDownBuf  = new CircularBuffer(MAX_PATTERN_SAMPLES);
      this.keyUpBuf    = new CircularBuffer(MAX_PATTERN_SAMPLES);
      this.moveBuf     = new CircularBuffer(MAX_PATTERN_SAMPLES);
      this.engageBuf   = new CircularBuffer(MAX_ENGAGEMENT_SAMPLES);
      this.msgLatency  = new CircularBuffer(MAX_ENGAGEMENT_SAMPLES);
      this.reportTimes = new CircularBuffer(MAX_ENGAGEMENT_SAMPLES);

      /* activity batching */
      this.activityBatch = [];

      /* listener setup */
      this._setupListeners();

      /* periodic reporting */
      this._reportTimer = null;
      this._beginReporting();
      console.info('📊 PageActivityMonitor initialised:', location.hostname);
    }

    /* ------------------------ listener wiring ------------------------ */
    _setupListeners () {
      /* visibility change (throttled) */
      document.addEventListener('visibilitychange', throttle(() => {
        const newVis = !document.hidden;
        if (newVis !== this.isVisible) {
          this.isVisible = newVis;
          this._postMessage({
            type: 'VISIBILITY_CHANGE',
            tabID: window.name,
            visibilityState: document.visibilityState,
            ts: Date.now()
          });
        }
      }, VISIBILITY_THROTTLE_MS));

      /* scroll */
      window.addEventListener('scroll',
        throttle(profileEvent('scroll', this._handleScroll.bind(this), this.perfTimes),
          SCROLL_THROTTLE_MS),
        { passive: true });

      /* click */
      document.addEventListener('click',
        profileEvent('click', this._handleClick.bind(this), this.perfTimes),
        { passive: true });

      /* keydown / keyup */
      document.addEventListener('keydown',
        profileEvent('keydown', this._handleKeyDown.bind(this), this.perfTimes),
        { passive: true });
      document.addEventListener('keyup',
        profileEvent('keyup', this._handleKeyUp.bind(this), this.perfTimes),
        { passive: true });

      /* mousemove */
      document.addEventListener('mousemove',
        throttle(profileEvent('mousemove', this._handleMouseMove.bind(this), this.perfTimes),
          MOUSE_THROTTLE_MS),
        { passive: true });

      /* unload flush */
      window.addEventListener('beforeunload', () => this._reportFinal());
    }

    /* ---------------------- per-event handlers ----------------------- */
    _handleScroll () {
      const now      = Date.now();
      const deltaY   = window.scrollY - (this._prevScrollY ?? window.scrollY);
      const deltaT   = (now - (this._prevScrollTs ?? now)) / 1000;
      const speed    = deltaT ? deltaY / deltaT : 0;

      this.scrolls++;
      this.scrollBuf.push({ y: window.scrollY, speed, ts: now });
      this._recordActivity('scroll');
      this._prevScrollY  = window.scrollY;
      this._prevScrollTs = now;
    }

    _handleClick (evt) {
      const now = Date.now();
      this.clicks++;
      this.clickBuf.push({ x: evt.clientX, y: evt.clientY, el: evt.target.tagName, ts: now });
      this._recordActivity('click');
    }

    _handleKeyDown (evt) {
      const now = Date.now();
      this.keydowns++;
      this.keyDownBuf.push({ code: evt.code, ts: now });
      this._recordActivity('keydown');
    }

    _handleKeyUp (evt) {
      this.keyUpBuf.push({ code: evt.code, ts: Date.now() });
    }

    _handleMouseMove (evt) {
      const now = Date.now();
      const dx  = evt.clientX - (this._prevMouse?.x ?? evt.clientX);
      const dy  = evt.clientY - (this._prevMouse?.y ?? evt.clientY);
      const dist = Math.hypot(dx, dy);
      this.mouseMoves++;
      this.moveBuf.push({ x: evt.clientX, y: evt.clientY, d: dist, ts: now });
      this._recordActivity('mousemove');
      this._prevMouse = { x: evt.clientX, y: evt.clientY };
    }

    /* ------------------------- core helpers -------------------------- */
    _recordActivity (type) {
      const ts = Date.now();
      this.activityBatch.push({ type, ts });
      this.lastActivityTs = ts;
    }

    _postMessage (msg) {
      const sw = navigator.serviceWorker.controller;
      if (!sw) {
        console.warn('SW not ready, message dropped:', msg.type);
        return;
      }
      try { sw.postMessage(msg); } catch (err) { console.warn('postMessage failed', err); }
    }

    /* ----------------------- periodic reporting ---------------------- */
    async _beginReporting () {
      const loop = async () => {
        await this._reportPeriodic();
        this._reportTimer = setTimeout(loop, REPORT_INTERVAL_MS);
      };
      await this._reportPeriodic();          // immediate first flush
      this._reportTimer = setTimeout(loop, REPORT_INTERVAL_MS);
      window.addEventListener('beforeunload', () => clearTimeout(this._reportTimer));
    }

    async _reportPeriodic () {
      const t0  = performance.now();
      const now = Date.now();

      /* simple engagement metric */
      const seconds      = (now - this.startTime) / 1000;
      const interactions = this.scrolls + this.clicks + this.keydowns + this.mouseMoves;
      const freq         = interactions / (seconds || 1);
      this.engageBuf.push({ ts: now, freq });

      const stats = {
        tabID   : window.name,
        url     : location.href,
        domain  : location.hostname,
        ts      : now,
        isVisible: this.isVisible,
        timeOnPageMs         : now - this.startTime,
        timeSinceLastMs      : now - this.lastActivityTs,
        interactionCounts    : {
          scrolls: this.scrolls, clicks: this.clicks,
          keystrokes: this.keydowns, mouseMoves: this.mouseMoves
        },
        interactionFrequency : freq,
        activityBatch        : this.activityBatch.splice(0), // flush
        performance          : {
          avgEventProcMs      : this._mean(this.perfTimes.toArray().map(e => e.time)),
          totalEventProcOps   : this.perfTimes.length
        }
      };

      /* send and record latency */
      const sendT0 = performance.now();
      this._postMessage({ type: 'BATCH_STATS', data: stats });
      this.msgLatency.push({ ts: now, latency: performance.now() - sendT0 });

      /* perf bookkeeping */
      this.reportTimes.push({ ts: now, reportMs: performance.now() - t0 });

      /* reset interval counters */
      this.scrolls = this.clicks = this.keydowns = this.mouseMoves = 0;
    }

    /* --------------------------- final flush ------------------------- */
    _reportFinal () {
      const now   = Date.now();
      const stats = {
        tabID   : window.name,
        url     : location.href,
        domain  : location.hostname,
        ts      : now,
        timeOnPageMs        : now - this.startTime,
        timeSinceLastMs     : now - this.lastActivityTs,
        interactionCounts   : {
          scrolls: this.scrolls, clicks: this.clicks,
          keystrokes: this.keydowns, mouseMoves: this.mouseMoves
        },
        isVisible : this.isVisible,
        activityScore: this._activityScore(),
        browserMetrics: {
          perf          : this._perfSummary(),
          interaction   : this._patternSummary(),
          engagement    : this.engageBuf.toArray()
        }
      };
      try { chrome.runtime.sendMessage({ action: 'finalStats', stats }); }
      catch (e) { console.warn('finalStats send failed', e); }
    }

    /* --------------------- analytics / utilities --------------------- */
    _activityScore () {
      const mins = Math.max((Date.now() - this.startTime) / 60_000, 1);
      return Math.round(((this.scrolls + this.clicks + this.keydowns) / mins) * 10) / 10;
    }

    _mean (arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

    _perfSummary () {
      const arr = this.perfTimes.toArray();
      const grouped = {};
      arr.forEach(e => (grouped[e.type] = grouped[e.type] || []).push(e.time));
      return Object.fromEntries(Object.entries(grouped).map(([k, v]) => ([
        k, { count: v.length, avg: this._mean(v), min: Math.min(...v), max: Math.max(...v) }
      ])));
    }

    _patternSummary () {
      return {
        scrollSpeeds : this.scrollBuf.toArray(),
        clickPositions: this.clickBuf.toArray(),
        keyCodes     : this.keyDownBuf.toArray(),
        mouseDistances: this.moveBuf.toArray()
      };
    }
  }

  /* expose for popup / dev-tools */
  window.pageActivityMonitor = new PageActivityMonitor();
})();
