/**
 * HoeffdingNode: Leaf and internal node for incremental Hoeffding Adaptive Tree.
 * Supports online updates, split evaluation using Hoeffding bound, serialization, and deserialization.
 */

const { calculateEntropy } = require('./utils/entropy-hoeffdingBound.js'); // implement or import entropy util
const { HoeffdingBound } = require('./utils/entropy-hoeffdingBound.js');   // util to compute Hoeffding bound

class HoeffdingNode {
  constructor(id = null) {
    this.id = id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.classStats = new Array(3).fill(0);      // counts per class
    this.featureStats = new Map();               // Map<featureIndex, { sum, sumSq, count }>
    this.instanceCount = 0;
    this.splitFeature = null;
    this.splitValue = null;
    this.leftChild = null;
    this.rightChild = null;
  }

  isLeaf() { //returns true if node has no children
    return this.leftChild === null && this.rightChild === null;
  }

  // Update sufficient statistics for one instance
  updateStats(features, classLabel) {
    this.instanceCount++;
    if (classLabel >= 0 && classLabel < this.classStats.length) {
      this.classStats[classLabel]++;
    }
    for (let i = 0; i < features.length; i++) {
      let stats = this.featureStats.get(i);
      if (!stats) {
        stats = { sum: 0, sumSq: 0, count: 0 };
        this.featureStats.set(i, stats);
      }
      const v = features[i];
      stats.sum += v;
      stats.sumSq += v * v;
      stats.count++;
    }
  }

  // Decide whether to split based on gracePeriod & bound
  shouldSplit(gracePeriod, delta) {
    if (this.instanceCount < gracePeriod || this.featureStats.size === 0) {
      return false;
    }
    return this.findBestSplit(delta) !== null;
  }

  // Find best split candidate or return null
  findBestSplit(delta) {
    const totalEntropy = calculateEntropy(this.classStats);
    let bestGain = -Infinity;
    let bestFeature = null;
    let bestValue = null;

    for (const [feature, stats] of this.featureStats.entries()) {
      if (stats.count < 2) continue;
      const mean = stats.sum / stats.count;
      // Partition classStats proportionally by mean split
      const leftStats = new Array(this.classStats.length).fill(0);
      const rightStats = [...this.classStats];
      const leftCount = Math.floor((stats.count / this.instanceCount) * this.instanceCount);
      // approximate split of classStats
      for (let c = 0; c < this.classStats.length; c++) {
        leftStats[c] = Math.floor((this.classStats[c] * leftCount) / this.instanceCount);
        rightStats[c] = this.classStats[c] - leftStats[c];
      }
      const leftEntropy = calculateEntropy(leftStats);
      const rightEntropy = calculateEntropy(rightStats);
      const weighted = (leftCount / this.instanceCount) * leftEntropy +
                       ((this.instanceCount - leftCount) / this.instanceCount) * rightEntropy;
      const gain = totalEntropy - weighted;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = feature;
        bestValue = mean;
      }
    }

    if (bestFeature === null) {
      return null;
    }
    const bound = HoeffdingBound(delta, this.instanceCount);
    return bestGain > bound
      ? { feature: bestFeature, value: bestValue }
      : null;
  }

  // Split into two children and redistribute instance counts
  split() {
    if (!this.isLeaf() || this.splitFeature === null) return;
    this.leftChild = new HoeffdingNode();
    this.rightChild = new HoeffdingNode();
    // naive redistribution: half stats to each
    this.leftChild.instanceCount = Math.floor(this.instanceCount / 2);
    this.rightChild.instanceCount = this.instanceCount - this.leftChild.instanceCount;
  }

  // Export node and subtree to JSON
  toJSON() {
    const obj = {
      id: this.id,
      classStats: [...this.classStats],
      instanceCount: this.instanceCount,
      splitFeature: this.splitFeature,
      splitValue: this.splitValue,
      featureStats: Array.from(this.featureStats.entries()).map(
        ([k, v]) => ({ feature: k, sum: v.sum, sumSq: v.sumSq, count: v.count })
      )
    };
    if (!this.isLeaf()) {
      obj.leftChild = this.leftChild.toJSON();
      obj.rightChild = this.rightChild.toJSON();
    }
    return obj;
  }

  // Reconstruct node (and subtree) from JSON
  static fromJSON(data) {
    const node = new HoeffdingNode(data.id);
    node.classStats = [...data.classStats];
    node.instanceCount = data.instanceCount;
    node.splitFeature = data.splitFeature;
    node.splitValue = data.splitValue;
    node.featureStats = new Map(
      data.featureStats.map(f => [f.feature, { sum: f.sum, sumSq: f.sumSq, count: f.count }])
    );
    if (data.leftChild || data.rightChild) {
      node.leftChild = data.leftChild ? HoeffdingNode.fromJSON(data.leftChild) : null;
      node.rightChild = data.rightChild ? HoeffdingNode.fromJSON(data.rightChild) : null;
    }
    return node;
  }

  // Get class distribution at this node
  getClassDistribution() {
    return [...this.classStats];
  }
}

module.exports = HoeffdingNode;
