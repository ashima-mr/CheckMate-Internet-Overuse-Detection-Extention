/* ===========================================================================
   feature-engineer.js
   ---------------------------------------------------------------------------
   Collects behavioural telemetry from every open tab (periodic 30 s BATCH_STATS
   and one-off finalStats), transforms it into fixed-length feature vectors and
   streams them to:
       • HoeffdingTree   – incremental classifier / concept-drift learner
       • MSPC            – multivariate-SPC anomaly detector (periodic only)

   The module is framework-agnostic: it works inside a Chrome/Firefox
   service-worker, a background page or Node.js (for offline replay tests).

   DEPENDS
   ────────────────────────────────────────────────────────────────────────────
     utils/circular-buffer.js   – O(1) ring buffer
     hoeffding-tree.js          – online decision tree with ADWIN drift
     mspc.js                    – Hotelling T² multivariate SPC
    ==========================================================================*/

'use strict';

/* --------- imports ------------------------------------------------------- */
import CircularBuffer from '../utils/circular-buffer.js';
import HoeffdingTree  from '../models/hoeffding-tree.js';
import { MSPC }       from '../models/mspc.js';
import { OnlineScaler } from '../utils/online-scaler.js'

/* --------- constants ----------------------------------------------------- */
const REPORT_PERIOD_MS = 30_000;             // must match content-script
const SHORT  = 60;                           // 30 min  (60  × 30 s)
const MEDIUM = 120;                          // 60 min  (120 × 30 s)
const LONG   = 240;                          // 2 h     (480 × 30 s)

/*   final feature vector (keep in sync with FEATURE_COUNT) */
const FEATURE_LAYOUT = [
  'scrollRate', 'clickRate', 'keyRate', 'mouseMoveRate',
  'interactionFreq', 'visible',                     // 5 + 1
  'mspc_s1','mspc_s2','mspc_s3','mspc_s4','mspc_s5','mspc_s6', 
  /*scroll count, clic count, keystroke count (keydown + keyup events), mouse-move count, interaction frq, time-since-last-activity*/
  'timeSinceLast', 'activityScore', 'domainDiversity', 'focusRatio'
];
const FEATURE_COUNT = FEATURE_LAYOUT.length;

export default class FeatureEngineer {
  /* ------------------------------------------------- ctor -------------- */
  constructor (opts = {}) {
    /* sliding windows (periodic vectors only) */
    this.winShort  = new CircularBuffer(opts.shortWin  ?? SHORT);
    this.winMedium = new CircularBuffer(opts.medWin    ?? MEDIUM);
    this.winLong   = new CircularBuffer(opts.longWin   ?? LONG);

    /* per-tab live session state */
    this.sessions = new Map();

    /* learners */
    this.tree = new HoeffdingTree({ nFeatures: FEATURE_COUNT });
    this.mspc = new MSPC(6);                        // scroll, clicks … timeSince

    // per-feature online z-score scalers
    this.scalers = Array.from({ length: FEATURE_COUNT },
    () => new OnlineScaler( /* optional decay α=*/0.01 ));

    /* allow UI → feedback */
    this._pendingFeedback = new Map();
  }

  /* ================================================= PUBLIC API ======== */

  /** entry point for all messages from content-script / SW */
  ingest (msg) {
    if (!msg) return;

    switch (msg.type || msg.action) {
      case 'BATCH_STATS':      /* periodic every 30 s */
        this._handlePeriodic(msg.data, msg.mspcVector, false);
        break;

      case 'FINAL_STATS':       /* tab unload */
        // treat as one last periodic report, then mark session closed
        this._handlePeriodic(msg.data, msg.mspcVector, true);
        break;

      /* optional extra messages (visibility, …) are ignored here */
    }
  }

  /** let UI push labelled feedback later (class 0‒2, confidence 0-1) */
  addUserFeedback (tabID, classValue, confidence = 1) {
    if (!this._pendingFeedback.has(tabID))
      this._pendingFeedback.set(tabID, []);
    this._pendingFeedback.get(tabID).push({ classValue, confidence });
  }

  /* ================================================= INTERNAL ========= */

  /* --------------------------- periodic message ----------------------- */
  _handlePeriodic (d, vecBuf, isFinal) {
    if (!d?.interactionCounts) {
        console.warn('Malformed telemetry:', d);
        return;
    }

    /* lazy-create session entry */
    const s = this.sessions.get(d.tabID) ??
              this._newSession(d.tabID, d.domain);
    this.sessions.set(d.tabID, s);

    /* update session aggregates */
    this._updateSessionState(s, d);

    /* build 15-dim feature vector */
    const feat = this._buildFeatureVector(s, d, vecBuf);

    /* keep last vector in session for UI */
    s.lastVec = feat;

    /* sliding-window buffers (used only for potential aggregate features) */
    this.winShort.push(feat);
    this.winMedium.push(feat);
    this.winLong.push(feat);

    /* ─── online learners ────────────────────────────────────────────── */
    /* 1) classification: label unknown ⇒ use neutral class (1) unless feedback queued */
    const fbQ = this._pendingFeedback.get(d.tabID);
    if (fbQ?.length) {
      const fb = fbQ.shift();                          // consume 1 feedback
      this.tree.train(feat, fb.classValue, { classValue: fb.classValue, confidence: fb.confidence });
    }

    /* 2) MSPC anomaly on raw 6-var vector (scrolls … timeSince) */
    if (vecBuf) this.mspc.ingest(new Float64Array(vecBuf));

    if (isFinal) {
        this._handleFinal({ tabID: d.tabID, browserMetrics: d.browserMetrics, ts: d.ts });
    }
  }

  /* --------------------------- final tab stats ----------------------- */
  _handleFinal (stats) {
    const s = this.sessions.get(stats.tabID);
    if (!s) return;

    /* capture rich interaction stats from _reportFinal() once */
    s.finalPatterns = stats.browserMetrics?.interaction ?? {};
    s.closed = true;
    s.closedAt = stats.ts;
  }

  /* --------------------------- build vector -------------------------- */
  _buildFeatureVector (s, d, vecBuf) {
    // raw feature computation (no caps)
    const perMinRaw = cnt => (cnt * 2);
    const scrollRate      = perMinRaw(d.interactionCounts.scrolls);
    const clickRate       = perMinRaw(d.interactionCounts.clicks);
    const keyRate         = perMinRaw(d.interactionCounts.keystrokes);
    const moveRate        = perMinRaw(d.interactionCounts.mouseMoves);
    const freq            = d.interactionFrequency;
    const vis             = d.isVisible ? 1 : 0;

    // unpack MSPC raw vector
    let spc = [0,0,0,0,0,0];
    if (vecBuf instanceof ArrayBuffer) {
        if (vecBuf.byteLength === 6 * 8) {
            spc = Array.from(new Float64Array(vecBuf));
        }
    }

    const idle            = d.timeSinceLastMs;
    const act             = (d.activityScore ?? 0);
    const dom             = s.domains.size;
    const duration        = Date.now() - s.startTime;
    const focusRatio      = duration > 0 ? s.focusMs / duration : 0;

    // assemble raw feature array
    const rawFeatures = [
      scrollRate, clickRate, keyRate, moveRate,
      freq, vis,
      ...spc,
      idle, act, dom, focusRatio
    ];

    // apply streaming z-score normalization per dimension
    return rawFeatures.map((x,i) => this.scalers[i].normalize(x));
  }

  /* --------------------------- per-session helpers ------------------- */
  _newSession (id, domain) {
    return {
      id,
      domains: new Set([domain]),
      startTime: Date.now(),
      focusMs: 0,
      lastVec: null
    };
  }

  _updateSessionState (s, d) {
    s.domains.add(d.domain);
    if (d.isVisible) s.focusMs += REPORT_PERIOD_MS;
  }
}
