'use strict';

const {
  calculateEntropy,
  HoeffdingBound
} = require('./utils/entropy-hoeffdingBound.js');

/**
 * Internal helper – binary-search insertion index.
 * Returns the position where v should be inserted in sorted array arr.
 */
function binarySearchInsert(arr, v) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function* mergeSortedClassBuffers(buffers) {
  const indices = new Array(buffers.length).fill(0);

  while (true) {
    let minValue = Infinity;
    let minClass = -1;

    for (let c = 0; c < buffers.length; c++) {
      const i = indices[c];
      if (i < buffers[c].length && buffers[c][i] < minValue) {
        minValue = buffers[c][i];
        minClass = c;
      }
    }

    if (minClass === -1) break;

    yield { v: minValue, c: minClass };
    indices[minClass]++;
  }
}

class HoeffdingNode {
  /**
   * @param {Object} opts
   * @param {number} opts.nClasses   – number of class labels
   * @param {number} opts.nFeatures  – fixed feature vector length
   * @param {string} [opts.id]       – unique node id (auto if omitted)
   * @param {number} [opts.cacheSize=1024]  – LRU entropy cache size
   * @param {number} [opts.bufferMax=10000] – maximum values per class/feature
   */
  constructor({
    nClasses,
    nFeatures,
    id = null,
    cacheSize = 1024,
    bufferMax = 10_000
  }) {
    if (!Number.isInteger(nClasses) || nClasses <= 0) {
      throw new Error('nClasses must be a positive integer');
    }
    if (!Number.isInteger(nFeatures) || nFeatures <= 0) {
      throw new Error('nFeatures must be a positive integer');
    }

    this.id = id || `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.nClasses = nClasses;
    this.nFeatures = nFeatures;

    // class statistics
    this.classStats = new Uint32Array(nClasses);
    this.instanceCount = 0;

    /** Map featureIndex → Array<classIndex → sorted numeric array> */
    this.sortedValues = new Map();

    // split attributes
    this.splitFeature = null;
    this.splitValue = null;
    this.leftChild = null;
    this.rightChild = null;

    // entropy memoisation (LRU)
    this._entropyCache = new Map();
    this._lruOrder = [];
    this._cacheSize = cacheSize;

    // buffer cap
    this._bufferMax = bufferMax;
    // cache for last best split result
    this._cachedSplit = null;
  }

  /* --------------------------- helpers --------------------------- */

  isLeaf() {
    return this.leftChild === null;
  }

  /** Least-recently used eviction helper */
  _memoEntropy(stats) {
    const key = stats.join(',');
    if (this._entropyCache.has(key)) {
      // refresh LRU position
      const idx = this._lruOrder.indexOf(key);
      if (idx > -1) this._lruOrder.splice(idx, 1);
      this._lruOrder.push(key);
      return this._entropyCache.get(key);
    }
    const ent = calculateEntropy(stats);
    this._entropyCache.set(key, ent);
    this._lruOrder.push(key);
    if (this._lruOrder.length > this._cacheSize) {
      const oldest = this._lruOrder.shift();
      this._entropyCache.delete(oldest);
    }
    return ent;
  }

  /* --------------------------- update --------------------------- */

  /**
   * Update node statistics with one instance.
   * Skips null / NaN feature values.
   */
  updateStats(features, classLabel) {
    this.instanceCount++;
    if (classLabel >= 0 && classLabel < this.nClasses)
      this.classStats[classLabel]++;

    for (let i = 0; i < this.nFeatures; i++) {
      const v = features[i];
      if (v == null || Number.isNaN(v)) continue;

      if (!this.sortedValues.has(i)) {
        this.sortedValues.set(
          i,
          Array.from({ length: this.nClasses }, () => [])
        );
      }
      const buffers = this.sortedValues.get(i);
      const arr = buffers[classLabel];
      const idx = binarySearchInsert(arr, v);
      arr.splice(idx, 0, v);
      if (arr.length > this._bufferMax) arr.shift(); // drop oldest
    }

    // invalidate split cache after stats change
    this._cachedSplit = null;
  }

  /* ---------------------- split evaluation ---------------------- */

  /**
   * Determine whether the node is ready to split.
   * @returns {boolean}
   */
  shouldSplit(gracePeriod, delta) {
    if (this.instanceCount < gracePeriod) return false;
    if (this.sortedValues.size === 0) return false;
    // cache best split to avoid recomputation
    if (this._cachedSplit === undefined)
      this._cachedSplit = this._findBestSplit(delta);
    return this._cachedSplit !== null;
  }

  /**
   * Returns best split {feature,value} or null
   */
  _findBestSplit(delta) {
    const H0 = this._memoEntropy(this.classStats);
    let bestGain = -Infinity;
    let bestFeat = null;
    let bestVal = null;

    if (this.instanceCount === 0) return null;

    for (const [f, buffers] of this.sortedValues.entries()) {
    const iterator = mergeSortedClassBuffers(buffers);
    const flat = Array.from(iterator);

      const leftStats = new Uint32Array(this.nClasses);

      for (let i = 1; i < flat.length; i++) {
        const clsLeft = flat[i - 1].c;
        leftStats[clsLeft]++;

        // skip equal consecutive values
        if (flat[i].v === flat[i - 1].v) continue;

        const cutValue = (flat[i].v + flat[i - 1].v) / 2;
        const leftCount = i;
        const rightCount = n - leftCount;
        if (leftCount === 0 || rightCount === 0) continue;

        const rightStats = new Uint32Array(this.nClasses);
        for (let c = 0; c < this.nClasses; c++) {
          rightStats[c] = this.classStats[c] - leftStats[c];
        }

        const Hl = this._memoEntropy(leftStats);
        const Hr = this._memoEntropy(rightStats);
        const Hw =
          (leftCount / n) * Hl + (rightCount / n) * Hr;
        const gain = H0 - Hw;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeat = f;
          bestVal = cutValue;
        }
      }
    }

    if (bestFeat === null) return null;
    const epsilon = HoeffdingBound(delta, n);
    return bestGain > epsilon ? { feature: bestFeat, value: bestVal } : null;
  }

  /* ------------------------- splitting -------------------------- */

  /**
   * Execute the split decided by shouldSplit().
   */
  split() {
    if (!this.isLeaf() || !this._cachedSplit) return false;

    const { feature, value } = this._cachedSplit;

    this.splitFeature = feature;
    this.splitValue = value;

    const commonOpts = {
      nClasses: this.nClasses,
      nFeatures: this.nFeatures,
      cacheSize: this._cacheSize,
      bufferMax: this._bufferMax
    };
    this.leftChild = new HoeffdingNode(commonOpts);
    this.rightChild = new HoeffdingNode(commonOpts);

    // replay buffered data
    for (const [f, buffers] of this.sortedValues.entries()) {
      buffers.forEach((arr, c) => {
        for (const v of arr) {
          const child = v <= value ? this.leftChild : this.rightChild;
          const feats = new Array(this.nFeatures).fill(null);
          feats[f] = v;
          child.updateStats(feats, c);
        }
      });
    }

    // clear for GC
    this.sortedValues.clear();
    this.classStats.fill(0);
    this.instanceCount = 0;
    this._entropyCache.clear();
    this._lruOrder.length = 0;
    this._cachedSplit = null;
    return true;
  }

  /* ------------------------- prediction ------------------------- */

  /**
   * Recursively route feature vector to leaf.
   * Null / NaN handled upstream.
   */
  findLeaf(features) {
    if (this.isLeaf()) return this;
    const v = features[this.splitFeature];
    const branch =
      v != null && !Number.isNaN(v) && v <= this.splitValue
        ? this.leftChild
        : this.rightChild;
    return branch.findLeaf(features);
  }

  getClassDistribution() {
    return Array.from(this.classStats);
  }

  /* ------------------ (de)serialisation ------------------------- */

  toJSON() {
    const vals = [];
    for (let f = 0; f < this.nFeatures; f++) {
      vals.push({
        feature: f,
        buffers: this.sortedValues.get(f) || []
      });
    }
    const obj = {
      id: this.id,
      nClasses: this.nClasses,
      nFeatures: this.nFeatures,
      classStats: Array.from(this.classStats),
      instanceCount: this.instanceCount,
      splitFeature: this.splitFeature,
      splitValue: this.splitValue,
      sortedValues: vals
    };
    if (!this.isLeaf()) {
      obj.leftChild = this.leftChild.toJSON();
      obj.rightChild = this.rightChild.toJSON();
    }
    return obj;
  }

  /** Rebuild node (and subtree) from plain JSON. */
  static fromJSON(data) {
    const node = new HoeffdingNode({
      nClasses: data.nClasses,
      nFeatures: data.nFeatures,
      cacheSize: 1024,
      bufferMax: 10000,
      id: data.id
    });
    node.classStats = Uint32Array.from(data.classStats);
    node.instanceCount = data.instanceCount;
    node.splitFeature = data.splitFeature;
    node.splitValue = data.splitValue;

    data.sortedValues.forEach(({ feature, buffers }) => {
      node.sortedValues.set(feature, buffers);
    });

    if (data.leftChild) {
      node.leftChild = HoeffdingNode.fromJSON(data.leftChild);
      node.rightChild = HoeffdingNode.fromJSON(data.rightChild);
    }
    return node;
  }
}

module.exports = HoeffdingNode;
