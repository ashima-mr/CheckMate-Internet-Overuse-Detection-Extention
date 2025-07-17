/**
 * Classes: 0=productive, 1=non-productive, 2=overuse
 */

const { HoeffdingNode } = require('./hoeffding-node.js');
const ADWIN = require('./adwin.js');
const CircularBuffer = require('.utils/circular-buffer.js');

class HoeffdingTree {
  constructor(options = {}) {
    // Hyperparameters
    this.gracePeriod = options.gracePeriod || 200;
    this.hoeffdingBound = options.hoeffdingBound || 0.05;
    this.numClasses = 3;
    this.classLabels = ['productive', 'non-productive', 'overuse'];

    // State
    this.root = new HoeffdingNode();
    this.instancesSeen = 0;
    this.driftCount = 0;

    // Sliding‐window performance monitoring
    const histSize = options.historySize || 500;
    this.accuracyHistory = new CircularBuffer(histSize);
    this.errorRateHistory = new CircularBuffer(histSize);
    this.timestamps = new CircularBuffer(histSize);

    // Tree snapshots for visualization
    this.treeHistory = new CircularBuffer(options.structureHistorySize || 100);

    // Node statistics with eviction
    this.nodeStatistics = new Map();
    this.maxNodeStats = options.maxNodeStats || 1000;

    // Drift detector (ADWIN only)
    this.driftDetector = new ADWIN({ delta: options.adwinDelta || 0.002 });

    // User-feedback buffer
    this.userFeedbackBuffer = [];
    this.feedbackWeight = options.feedbackWeight || 2.0;
  }

  // Train/update with one instance
  update(features, actualClass, userFeedback = null) {
    this.instancesSeen++;

    // Predict, then update performance
    const prediction = this._predictLeaf(features);
    const isCorrect = prediction.prediction === actualClass;

    // Record performance
    this.accuracyHistory.push(isCorrect ? 1 : 0);
    this.errorRateHistory.push(isCorrect ? 0 : 1);
    this.timestamps.push(Date.now());

    // Integrate user feedback if provided
    if (userFeedback !== null) {
      this._incorporateUserFeedback(features, actualClass, userFeedback);
    }

    // Drift detection
    this.driftDetector.update(isCorrect ? 0 : 1);
    if (this.driftDetector.drift) {
      this._handleDrift();
    }

    // Grow tree
    this._updateTree(features, actualClass);

    // Snapshot structure periodically
    if (this.instancesSeen % (options.snapshotInterval || 50) === 0) {
      this._captureTreeStructure();
    }

    return {
      updated: true,
      drift: this.driftDetector.drift,
      accuracy: this._recentAccuracy(),
      treeDepth: this._getTreeDepth(this.root),
    };
  }

  // Internal prediction: returns leaf and distribution
  _predictLeaf(features) {
    const leaf = this.root.findLeaf(features);
    const dist = leaf.getClassDistribution();
    let maxVotes = -Infinity, maxClass = 0, total = dist.reduce((s, v) => s + v, 0);
    for (let i = 0; i < this.numClasses; i++) {
      if ((dist[i] || 0) > maxVotes) {
        maxVotes = dist[i];
        maxClass = i;
      }
    }
    const probs = total > 0 ? dist.map(v => v/total) : Array(this.numClasses).fill(1/this.numClasses);
    return {
      prediction: maxClass,
      confidence: total > 0 ? maxVotes/total : 1/this.numClasses,
      classDistribution: probs,
      classLabel: this.classLabels[maxClass],
      timestamp: Date.now(),
      nodeId: leaf.id,
      features: [...features]
    };
  }

  // Main tree update logic
  _updateTree(features, classLabel) {
    const leaf = this.root.findLeaf(features);
    leaf.updateStats(features, classLabel);
    if (leaf.shouldSplit(this.gracePeriod, this.hoeffdingBound)) {
      const split = leaf.findBestSplit(this.hoeffdingBound);
      if (split) {
        leaf.splitFeature = split.feature;
        leaf.splitValue = split.value;
        leaf.leftChild = new HoeffdingNode();
        leaf.rightChild = new HoeffdingNode();
        leaf.redistributeInstances();
      }
    }
  }

  // Capture and buffer current tree structure
  _captureTreeStructure() {
    const snapshot = {
      timestamp: Date.now(),
      instancesSeen: this.instancesSeen,
      treeDepth: this._getTreeDepth(this.root),
      leafCount: this._getLeafCount(this.root),
      structure: this.root.toJSON()
    };
    this.treeHistory.push(snapshot);
  }

  // Handle concept drift by partial reset
  _handleDrift() {
    this.driftCount++;
    // Reset statistics on root and replay recent feedback
    this.root = new HoeffdingNode();
    const recentFeedback = this.userFeedbackBuffer.slice(-100);
    for (const fb of recentFeedback) {
      for (let i = 0; i < Math.ceil(fb.confidence * this.feedbackWeight); i++) {
        this._updateTree(fb.features, fb.userCorrection);
      }
    }
    this.driftDetector.reset();
  }

  // Incorporate user feedback into buffer and tree
  _incorporateUserFeedback(features, actualClass, userFeedback) {
    const fb = {
      features: [...features],
      actualClass,
      userCorrection: userFeedback.classValue,
      confidence: userFeedback.confidence || 1.0,
      timestamp: Date.now()
    };
    this.userFeedbackBuffer.push(fb);
    if (this.userFeedbackBuffer.length > this.gracePeriod) {
      this.userFeedbackBuffer.shift();
    }
    // Immediate update on correction
    if (fb.userCorrection !== actualClass) {
      for (let i = 0; i < this.feedbackWeight; i++) {
        this._updateTree(features, fb.userCorrection);
      }
    }
  }

  // Utility: recent rolling accuracy
  _recentAccuracy(windowSize = 50) {
    const arr = this.accuracyHistory.toArray().slice(-windowSize);
    if (arr.length === 0) return 0;
    return arr.reduce((s,v) => s+v, 0)/arr.length;
  }

  // Utility: tree depth
  _getTreeDepth(node) {
    if (!node || node.isLeaf()) return 0;
    return 1 + Math.max(this._getTreeDepth(node.leftChild), this._getTreeDepth(node.rightChild));
  }

  // Utility: leaf count
  _getLeafCount(node) {
    if (!node) return 0;
    if (node.isLeaf()) return 1;
    return this._getLeafCount(node.leftChild) + this._getLeafCount(node.rightChild);
  }

  // Public API endpoints
  train(features, actualClass, feedback = null) {
    return this.update(features, actualClass, feedback);
  }

  predict(features) {
    return this._predictLeaf(features);
  }

  getStats() {
    return {
      instancesSeen: this.instancesSeen,
      treeDepth: this._getTreeDepth(this.root),
      leafCount: this._getLeafCount(this.root),
      driftCount: this.driftCount,
      recentAccuracy: this._recentAccuracy(),
      performanceTimeSeries: {
        accuracy: this.accuracyHistory.toArray(),
        errorRate: this.errorRateHistory.toArray(),
        timestamps: this.timestamps.toArray()
      },
      treeHistory: this.treeHistory.toArray()
    };
  }

  exportModel() {
    return JSON.stringify({
      root: this.root.toJSON(),
      instancesSeen: this.instancesSeen,
      driftCount: this.driftCount
    });
  }

  loadModel(modelJson) {
    const data = JSON.parse(modelJson);
    this.root = HoeffdingNode.fromJSON(data.root);
    this.instancesSeen = data.instancesSeen;
    this.driftCount = data.driftCount;
  }
}

module.exports = HoeffdingTree;
