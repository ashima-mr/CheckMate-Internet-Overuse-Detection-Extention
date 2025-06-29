/**
 * Enhanced Hoeffding Adaptive Tree implementation for 3-class classification
 * Classes: 0=Productive, 1=Unproductive, 2=Unhealthy
 * Supports user feedback integration and concept drift detection
 */

class HoeffdingTree {
  constructor(options = {}) {
    this.gracePeriod = options.gracePeriod || 200;
    this.hoeffdingBound = options.hoeffdingBound || 0.05;
    this.root = new HoeffdingNode();
    this.numClasses = 3;
    this.classLabels = ['productive', 'non-productive', 'overuse'];
    this.featureCount = 0;
    this.instancesSeen = 0;

    // Choose drift detector type
    this.driftDetectionMethod = options.driftDetectionMethod || 'SPC';

    if (this.driftDetectionMethod === 'SPC') {
      // e.g. StatisticalProcessControl(windowSize, sigmaThreshold)
      this.driftDetector    = new StatisticalProcessControl(
                                options.spcWindowSize || 100,
                                options.spcSigmaThreshold || 3
                              );
      this.warningDetector  = new StatisticalProcessControl(
                                options.spcWindowSize || 100,
                                options.spcSigmaThreshold || 3
                              );
    } else {
      // Default to ADWIN
      this.driftDetector    = new ADWIN(options.adwinDelta || 0.002);
      this.warningDetector  = new ADWIN(options.adwinDelta || 0.002);
    }

    this.userFeedbackBuffer = [];
    this.feedbackWeight = 2.0;
    this.adaptationRate = 0.1;
    this.feedbackPromptInterval = 15 * 60 * 1000; // 15 minutes
    this.lastFeedbackTime = 0;
    this.pendingFeedbackRequests = [];
  }

  /**
   * Predict class for given features
   * Returns object with prediction, confidence, and class probabilities
   */
  predict(features) {
    if (!features || features.length === 0) {
      return {
        prediction: 0,
        confidence: 0.33,
        classDistribution: [0.33, 0.33, 0.34],
        classLabel: this.classLabels[0]
      };
    }

    const leafNode = this.findLeaf(features, this.root);
    const classDistribution = leafNode.getClassDistribution();

    let maxClass = 0;
    let maxVotes = 0;
    let totalVotes = 0;

    // Tally votes across all classes
    for (let i = 0; i < this.numClasses; i++) {
      const votes = classDistribution[i] || 0;
      totalVotes += votes;
      if (votes > maxVotes) {
        maxVotes = votes;
        maxClass = i;
      }
    }

    // Compute confidence and normalized probabilities
    const confidence = totalVotes > 0 ? maxVotes / totalVotes : 0.33;
    const probabilities = totalVotes > 0
      ? classDistribution.map(v => v / totalVotes)
      : [0.33, 0.33, 0.34];

    return {
      prediction: maxClass,
      confidence: confidence,
      classDistribution: probabilities,
      classLabel: this.classLabels[maxClass]
    };
  }

  /**
   * Update tree with new instance and handle user feedback
   */
  update(features, actualClass, userFeedback = null) {
    this.instancesSeen++;
    this.featureCount = Math.max(this.featureCount, features.length);

    // Handle user feedback if provided
    if (userFeedback !== null) {
      this.incorporateUserFeedback(features, actualClass, userFeedback);
    }

    // Check if we need to prompt for feedback
    this.checkFeedbackPrompt(features);

    // Get prediction before update for drift detection
    const prediction = this.predict(features);
    const isCorrect = prediction.prediction === actualClass;

    // Update drift detectors
    this.driftDetector.update(isCorrect ? 0 : 1);
    this.warningDetector.update(isCorrect ? 0 : 1);

    // Check for concept drift
    if (this.driftDetector.drift) {
      this.handleConceptDrift();
    } else if (this.warningDetector.drift) {
      this.handleWarning();
    }

    // Update tree structure
    this.updateTree(features, actualClass);

    return {
      updated: true,
      drift: this.driftDetector.drift,
      warning: this.warningDetector.drift,
      needsFeedback: this.shouldPromptForFeedback()
    };
  }

  /**
   * Check if we should prompt user for feedback
   */
  checkFeedbackPrompt(features) {
    const now = Date.now();
    const timeSinceLastFeedback = now - this.lastFeedbackTime;

    // Prompt every 15 minutes if we haven't reached grace period
    if (timeSinceLastFeedback >= this.feedbackPromptInterval && 
        this.userFeedbackBuffer.length < this.gracePeriod) {

      this.pendingFeedbackRequests.push({
        timestamp: now,
        features: [...features],
        sessionContext: this.getCurrentSessionContext()
      });

      this.lastFeedbackTime = now;
    }
  }

  /**
   * Get current session context for feedback
   */
  getCurrentSessionContext() {
    return {
      sessionDuration: Date.now() - (this.sessionStartTime || Date.now()),
      instancesSeen: this.instancesSeen,
      recentPredictions: this.getRecentPredictions(5)
    };
  }

  /**
   * Process user feedback for session labeling
   */
  processSessionFeedback(sessionLabel, reasoning = '') {
    const feedback = {
      sessionLabel: sessionLabel, // 'productive', 'non-productive', 'overuse'
      classValue: this.sessionLabelToClass(sessionLabel),
      timestamp: Date.now(),
      reasoning: reasoning,
      confidence: 1.0
    };

    // Apply feedback to recent instances
    const recentInstances = this.getRecentInstances(10);
    recentInstances.forEach(instance => {
      this.incorporateUserFeedback(
        instance.features, 
        instance.actualClass, 
        feedback
      );
    });

    // Clear pending feedback requests
    this.pendingFeedbackRequests = [];

    return feedback;
  }

  /**
   * Convert session label to class value
   */
  sessionLabelToClass(sessionLabel) {
    const labelMap = {
      'productive': 0,
      'non-productive': 1, 
      'overuse': 2
    };
    return labelMap[sessionLabel.toLowerCase()] || 1;
  }

  /**
   * Incorporate user feedback into the learning process
   */
  incorporateUserFeedback(features, actualClass, userFeedback) {
    const feedback = {
      features: [...features],
      actualClass: actualClass,
      userCorrection: userFeedback.classValue || userFeedback.correctClass,
      confidence: userFeedback.confidence || 1.0,
      timestamp: Date.now(),
      reasoning: userFeedback.reasoning || ''
    };

    this.userFeedbackBuffer.push(feedback);

    // Apply immediate correction with higher weight
    if (userFeedback.classValue !== actualClass) {
      for (let i = 0; i < this.feedbackWeight; i++) {
        this.updateTree(features, userFeedback.classValue);
      }
    }

    // Keep buffer size manageable
    if (this.userFeedbackBuffer.length > 200) {
      this.userFeedbackBuffer.shift();
    }
  }

  /**
   * Update the tree structure with new instance
   */
  updateTree(features, actualClass) {
    const leafNode = this.findLeaf(features, this.root);
    leafNode.updateStats(features, actualClass);

    // Check if leaf should be split
    if (leafNode.shouldSplit(this.gracePeriod, this.hoeffdingBound)) {
      this.splitLeaf(leafNode, features);
    }
  }

  /**
   * Find the appropriate leaf node for given features
   */
  findLeaf(features, node) {
    if (node.isLeaf()) {
      return node;
    }

    const splitFeature = node.splitFeature;
    const splitValue = node.splitValue;

    if (features[splitFeature] <= splitValue) {
      return this.findLeaf(features, node.leftChild);
    } else {
      return this.findLeaf(features, node.rightChild);
    }
  }

  /**
   * Split a leaf node based on best attribute
   */
  splitLeaf(leafNode, features) {
    const bestSplit = leafNode.findBestSplit(this.hoeffdingBound);
    if (bestSplit) {
      leafNode.splitFeature = bestSplit.feature;
      leafNode.splitValue = bestSplit.value;
      leafNode.leftChild = new HoeffdingNode();
      leafNode.rightChild = new HoeffdingNode();
      leafNode.redistributeInstances();
    }
  }

  /**
   * Handle concept drift by resetting tree
   */
  handleConceptDrift() {
    console.log('Concept drift detected, adapting tree...');
    this.root = new HoeffdingNode();
    this.retrainWithFeedback();
    this.driftDetector.reset();
    this.warningDetector.reset();
  }

  /**
   * Handle warning by preparing for potential drift
   */
  handleWarning() {
    console.log('Warning: Potential concept drift detected');
  }

  /**
   * Retrain the tree with user feedback
   */
  retrainWithFeedback() {
    const recentFeedback = this.userFeedbackBuffer.slice(-100);
    for (const feedback of recentFeedback) {
      for (let i = 0; i < Math.ceil(feedback.confidence * this.feedbackWeight); i++) {
        this.updateTree(feedback.features, feedback.userCorrection);
      }
    }
  }

  /**
   * Check if we should prompt for feedback
   */
  shouldPromptForFeedback() {
    return this.pendingFeedbackRequests.length > 0;
  }

  /**
   * Get pending feedback requests
   */
  getPendingFeedbackRequests() {
    return this.pendingFeedbackRequests;
  }

  /**
   * Get tree statistics
   */
  getStats() {
    return {
      instancesSeen: this.instancesSeen,
      treeDepth: this.getTreeDepth(this.root),
      leafCount: this.getLeafCount(this.root),
      userFeedbackCount: this.userFeedbackBuffer.length,
      driftCount: this.driftDetector.driftCount || 0,
      pendingFeedbackRequests: this.pendingFeedbackRequests.length,
      classDistribution: this.getOverallClassDistribution()
    };
  }

  /**
   * Get overall class distribution
   */
  getOverallClassDistribution() {
    const distribution = [0, 0, 0];
    this.userFeedbackBuffer.forEach(feedback => {
      if (feedback.userCorrection >= 0 && feedback.userCorrection < 3) {
        distribution[feedback.userCorrection]++;
      }
    });
    return distribution;
  }

  /**
   * Calculate tree depth
   */
  getTreeDepth(node, depth = 0) {
    if (!node || node.isLeaf()) {
      return depth;
    }
    const leftDepth = this.getTreeDepth(node.leftChild, depth + 1);
    const rightDepth = this.getTreeDepth(node.rightChild, depth + 1);
    return Math.max(leftDepth, rightDepth);
  }

  /**
   * Count leaf nodes
   */
  getLeafCount(node) {
    if (!node) return 0;
    if (node.isLeaf()) return 1;
    return this.getLeafCount(node.leftChild) + this.getLeafCount(node.rightChild);
  }

  /**
   * Reset the entire tree
   */
  reset() {
    this.root = new HoeffdingNode();
    this.instancesSeen = 0;
    this.userFeedbackBuffer = [];
    this.pendingFeedbackRequests = [];
    this.driftDetector.reset();
    this.warningDetector.reset();
  }
}

/**
 * Enhanced Node class for 3-class Hoeffding Tree
 */
class HoeffdingNode {
  constructor() {
    this.classStats = new Array(3).fill(0); // 3-class classification
    this.featureStats = new Map();
    this.splitFeature = null;
    this.splitValue = null;
    this.leftChild = null;
    this.rightChild = null;
    this.instanceCount = 0;
  }

  /**
   * Check if this is a leaf node
   */
  isLeaf() {
    return this.leftChild === null && this.rightChild === null;
  }

  /**
   * Update statistics with new instance
   */
  updateStats(features, classLabel) {
    this.instanceCount++;
    if (classLabel >= 0 && classLabel < 3) {
      this.classStats[classLabel]++;
    }

    // Update feature statistics
    for (let i = 0; i < features.length; i++) {
      if (!this.featureStats.has(i)) {
        this.featureStats.set(i, { sum: 0, sumSquared: 0, count: 0 });
      }

      const stats = this.featureStats.get(i);
      stats.sum += features[i];
      stats.sumSquared += features[i] * features[i];
      stats.count++;
    }
  }

  /**
   * Check if node should be split
   */
  shouldSplit(gracePeriod, hoeffdingBound) {
    if (this.instanceCount < gracePeriod) {
      return false;
    }

    const bestSplit = this.findBestSplit(hoeffdingBound);
    return bestSplit !== null;
  }

  /**
   * Find the best split for this node
   */
  findBestSplit(hoeffdingBound) {
    let bestGain = -Infinity;
    let bestSplit = null;

    // Try splits on each feature
    for (const [feature, stats] of this.featureStats.entries()) {
      if (stats.count < 2) continue;

      const mean = stats.sum / stats.count;
      const gain = this.calculateInfoGain(feature, mean);

      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = { feature, value: mean, gain };
      }
    }

    // Check Hoeffding bound
    const hoeffdingValue = Math.sqrt(Math.log(1/hoeffdingBound) / (2 * this.instanceCount));

    if (bestGain > hoeffdingValue) {
      return bestSplit;
    }

    return null;
  }

  /**
   * Calculate information gain for a split (3-class version)
   */
  calculateInfoGain(feature, splitValue) {
    const totalEntropy = this.calculateEntropy(this.classStats);

    // Simplified split for demonstration
    const leftStats = new Array(3).fill(0);
    const rightStats = new Array(3).fill(0);

    const leftCount = Math.floor(this.instanceCount / 2);
    const rightCount = this.instanceCount - leftCount;

    // Distribute instances proportionally
    for (let i = 0; i < 3; i++) {
      leftStats[i] = Math.floor(this.classStats[i] * leftCount / this.instanceCount);
      rightStats[i] = this.classStats[i] - leftStats[i];
    }

    const leftEntropy = this.calculateEntropy(leftStats);
    const rightEntropy = this.calculateEntropy(rightStats);

    const weightedEntropy = (leftCount / this.instanceCount) * leftEntropy +
                           (rightCount / this.instanceCount) * rightEntropy;

    return totalEntropy - weightedEntropy;
  }

  /**
   * Calculate entropy for 3-class distribution
   */
  calculateEntropy(classStats) {
    const total = classStats.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;

    let entropy = 0;
    for (const count of classStats) {
      if (count > 0) {
        const probability = count / total;
        entropy -= probability * Math.log2(probability);
      }
    }
    return entropy;
  }

  /**
   * Get class distribution
   */
  getClassDistribution() {
    return [...this.classStats];
  }

  /**
   * Redistribute instances to child nodes (simplified)
   */
  redistributeInstances() {
    if (this.leftChild) {
      this.leftChild.instanceCount = Math.floor(this.instanceCount / 2);
    }
    if (this.rightChild) {
      this.rightChild.instanceCount = this.instanceCount - this.leftChild.instanceCount;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HoeffdingTree, HoeffdingNode};
}
