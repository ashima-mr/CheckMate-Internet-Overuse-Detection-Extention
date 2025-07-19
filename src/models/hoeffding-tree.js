'use strict';

const HoeffdingNode = require('./hoeffding-node.js');
const ADWIN = require('./adwin.js');
const CircularBuffer = require('./utils/circular-buffer.js');

class HoeffdingTree {
  /**
   * @param {Object} opts
   * @param {number} opts.nFeatures - required
   * @param {number} [opts.nClasses=3]
   * @param {string[]} [opts.classLabels]
   * @param {number} [opts.gracePeriod=200]
   * @param {number} [opts.delta=0.05]
   * @param {number} [opts.feedbackWeight=2]
   * @param {number} [opts.cacheSize=1024]
   * @param {number} [opts.bufferMax=10000]
   * @param {number} [opts.historySize=500]
   * @param {number} [opts.structureHistorySize=100]
   * @param {number} [opts.adwinDelta=0.002]
   */
  constructor(opts = {}) {
    if (!Number.isInteger(opts.nFeatures) || opts.nFeatures <= 0)
      throw new Error('nFeatures must be a positive integer');

    // core parameters
    this.nFeatures = opts.nFeatures;
    this.numClasses = opts.nClasses ?? 3;
    this.classLabels =
      opts.classLabels ?? ['productive', 'non-productive', 'overuse'];

    this.gracePeriod = opts.gracePeriod ?? 200;
    this.delta = opts.delta ?? 0.05;
    this.feedbackWeight = opts.feedbackWeight ?? 3.5;

    this.cacheSize = opts.cacheSize ?? 1024;
    this.bufferMax = opts.bufferMax ?? 10000;

    // root node
    this.root = new HoeffdingNode({
      nClasses: this.numClasses,
      nFeatures: this.nFeatures,
      cacheSize: this.cacheSize,
      bufferMax: this.bufferMax
    });

    // online statistics
    this.instancesSeen = 0;
    this.driftCount = 0;
    this.splitCount = 0;

    // fixed-size history
    const hSize = opts.historySize ?? 500;
    this.accuracyHistory = new CircularBuffer(hSize);
    this.errorRateHistory = new CircularBuffer(hSize);
    this.timestamps = new CircularBuffer(hSize);
    this.treeHistory = new CircularBuffer(opts.structureHistorySize ?? 100);

    // drift detector
    this.driftDetector = new ADWIN({ delta: opts.adwinDelta ?? 0.002 });

    // batched user feedback
    this.userFeedbackBuffer = [];
    this.feedbackBatchSize = this.gracePeriod;
  }

  /* ------------------------ public API ------------------------- */

  /**
   * Incremental training.
   * @param {number[]} features
   * @param {number} actualClass
   * @param {{classValue:number,confidence?:number}|null} feedback
   */
  train(features, actualClass, feedback = null) {
    // basic validation
    if (!Array.isArray(features) || features.length !== this.nFeatures)
      throw new Error(`Expected ${this.nFeatures} features`);
    if (actualClass < 0 || actualClass >= this.numClasses)
      throw new Error('Invalid class label');

    this.instancesSeen++;

    /* 1. prediction & accuracy */
    const pred = this._predictLeaf(features);
    const correct = pred.prediction === actualClass;
    this.accuracyHistory.push(correct ? 1 : 0);
    this.errorRateHistory.push(correct ? 0 : 1);
    this.timestamps.push(Date.now());

    /* 2. buffer external feedback */
    if (feedback) {
      this.userFeedbackBuffer.push({
        features: [...feedback.features ?? features],
        correction: feedback.classValue,
        confidence: feedback.confidence ?? 1.0
      });
    }
    if (this.userFeedbackBuffer.length >= this.feedbackBatchSize)
      this._flushFeedback();

    /* 3. concept-drift monitoring */
    this.driftDetector.update(correct ? 0 : 1);
    if (this.driftDetector.drift) this._handleDrift();

    /* 4. tree update with ground-truth */
    this._updateTree(features, actualClass);

    /* 5. periodic snapshot */
    if (this.instancesSeen % 300 === 0) this._snapshot();

    return {
      updated: true,
      drift: this.driftDetector.drift,
      recentAccuracy: this._recentAccuracy(),
      instancesSeen: this.instancesSeen,
      splitCount: this.splitCount,      
      driftCount: this.driftCount
    };
  }

  /** Predict class label only (no stats updated) */
  predict(features) {
    const leaf = this.root.findLeaf(features);
    const dist = leaf.getClassDistribution();
    const total = dist.reduce((a, b) => a + b, 0);
    let best = 0,
      maxVotes = -1;
    dist.forEach((cnt, idx) => {
      if (cnt > maxVotes) {
        maxVotes = cnt;
        best = idx;
      }
    });
    return {
      prediction: best,
      confidence: total ? maxVotes / total : 0,
      classLabel: this.classLabels[best]
    };
  }

  /** Export complete tree and meta-data to JSON string */
  exportModel() {
    return JSON.stringify({
      root: this.root.toJSON(),
      instancesSeen: this.instancesSeen,
      driftCount: this.driftCount,
      hyperparameters: {
        gracePeriod: this.gracePeriod,
        delta: this.delta,
        nFeatures: this.nFeatures,
        nClasses: this.numClasses,
        feedbackWeight: this.feedbackWeight,
        cacheSize: this.cacheSize,
        bufferMax: this.bufferMax
      }
    });
  }

  /** Restore from JSON string */
  loadModel(json) {
    const data = JSON.parse(json);
    this.root = HoeffdingNode.fromJSON(data.root);
    this.instancesSeen = data.instancesSeen ?? 0;
    this.driftCount = data.driftCount ?? 0;
  }

  /* -------------------- internal utilities -------------------- */

  _predictLeaf(features) {
    const leaf = this.root.findLeaf(features);
    const dist = leaf.getClassDistribution();
    const total = dist.reduce((a, b) => a + b, 0);
    let cls = 0,
      votes = -1;
    dist.forEach((c, i) => {
      if (c > votes) {
        votes = c;
        cls = i;
      }
    });
    return { prediction: cls };
  }

  _updateTree(features, classLabel) {
    const leaf = this.root.findLeaf(features);
    leaf.updateStats(features, classLabel);

    if (leaf.shouldSplit(this.gracePeriod, this.delta)) {
      if (leaf.split()) this.splitCount++;
    }
  }

  _flushFeedback() {
    const batch = this.userFeedbackBuffer.splice(0);
    batch.forEach(fb => {
      for (let i = 0; i < Math.ceil(this.feedbackWeight * fb.confidence); i++) {
        this._updateTree(fb.features, fb.correction);
      }
    });
  }

  _handleDrift() {
    // reset the whole tree after drift
    this.root = new HoeffdingNode({
      nClasses: this.numClasses,
      nFeatures: this.nFeatures,
      cacheSize: this.cacheSize,
      bufferMax: this.bufferMax
    });
    this.driftDetector.reset();
    this.driftCount++;
  }

  _snapshot() {
    try {
      this.treeHistory.push(this.root.toJSON());
    } catch (e) {
      // ignore serialisation errors
    }
  }

  _recentAccuracy() {
    const arr = this.accuracyHistory.toArray();
    return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  }
}

module.exports = HoeffdingTree;
