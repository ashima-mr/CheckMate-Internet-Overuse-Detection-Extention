class ADWIN {
  /**
   * @param {Object} options
   * @param {number} [options.delta=0.002] - Confidence parameter
   * @param {number} [options.minWindowLength=5] - Minimum window size before checking drift
   * @param {number} [options.compressThreshold=100] - Max buckets before compression
   * @param {function(string):void} [options.logger=console.log] - Logging function
   */
  constructor({
    delta = 0.002,
    minWindowLength = 5,
    compressThreshold = 100,
    logger = console.log
  } = {}) {
    this.delta = delta;
    this.minWindowLength = minWindowLength;
    this.compressThreshold = compressThreshold;
    this.logger = logger;

    // Internal state
    this.buckets = [];            // Buckets storing aggregated data
    this.total = 0;               // Sum of all values in current window
    this.totalSumSquares = 0;     // Sum of squares of values
    this.width = 0;               // Number of observations
    this.variance = 0;            // Variance within window
    
    this.drift = false;           // Whether drift was detected on last update
    this.driftCount = 0;          // Total drift events detected
    this.lastDriftPoint = -1;     // Index of last drift detection
  }

  /**
   * Update ADWIN with a new data point.
   * @param {number} value
   */
  update(value) {
    this.drift = false;
    this._addBucket(value);
    this._checkForDrift();
    this._compressBuckets();
  }

  /**
   * Add a new bucket for the incoming data point.
   * @private
   * @param {number} value
   */
  _addBucket(value) {
    const bucket = {
      sum: value,
      sumSquares: value * value,
      size: 1,
      timestamp: Date.now()
    };
    this.buckets.push(bucket);
    this.total += value;
    this.totalSumSquares += value * value;
    this.width += 1;
    this._updateVariance();
  }

  /**
   * Recompute variance in O(1) via running totals.
   * @private
   */
  _updateVariance() {
    if (this.width < 2) {
      this.variance = 0;
      return;
    }
    const mean = this.total / this.width;
    this.variance = Math.max(
      0,
      this.totalSumSquares / this.width - mean * mean
    );
  }

  /**
   * Check for concept drift by trying all cut points.
   * @private
   */
  _checkForDrift() {
    if (this.width < this.minWindowLength * 2) return;

    // Precompute invariant log factor
    const logFactor = Math.log(2 * Math.log(this.width) / this.delta);

    let leftSum, leftSumSquares, leftSize;
    // Try different cut points
    for (let cut = this.minWindowLength; cut <= this.width - this.minWindowLength; cut++) {
      // Reset accumulators for each cut
      leftSum = 0;
      leftSumSquares = 0;
      leftSize = 0;

      // Accumulate left-window stats
      for (let j = 0; j < cut; j++) {
        const b = this.buckets[j];
        leftSum += b.sum;
        leftSumSquares += b.sumSquares;
        leftSize += b.size;
      }
      const rightSize = this.width - leftSize;
      if (rightSize <= 0) continue;

      const rightSum = this.total - leftSum;
      const rightSumSquares = this.totalSumSquares - leftSumSquares;

      const leftMean = leftSum / leftSize;
      const rightMean = rightSum / rightSize;

      const eps = Math.sqrt(
        (2 * this.variance * logFactor) /
          (1 / ((1 / leftSize) + (1 / rightSize)))
      );

      if (Math.abs(leftMean - rightMean) > eps) {
        this._detectDrift();
        this._dropOldBuckets(cut);
        return;
      }
    }
  }

  /**
   * Detect drift, update counters, and log.
   * @private
   */
  _detectDrift() {
    this.drift = true;
    this.driftCount += 1;
    this.lastDriftPoint = this.width;
    this.logger(`ADWIN: Concept drift detected at point ${this.width}`);
  }

  /**
   * Drop old buckets before the cut point.
   * @private
   * @param {number} cutPoint
   */
  _dropOldBuckets(cutPoint) {
    if (cutPoint < 1 || cutPoint >= this.buckets.length) {
      // invalid cutPoint, skip dropping
      return;
    }
    this.buckets = this.buckets.slice(cutPoint);
    this._recalculateStatistics();
  }

  /**
   * Recalculate running totals after bucket removal.
   * @private
   */
  _recalculateStatistics() {
    this.total = 0;
    this.totalSumSquares = 0;
    this.width = 0;
    for (const b of this.buckets) {
      this.total += b.sum;
      this.totalSumSquares += b.sumSquares;
      this.width += b.size;
    }
    this._updateVariance();
  }

  /**
   * Compress buckets when exceeding threshold.
   * @private
   */
  _compressBuckets() {
    if (this.buckets.length <= this.compressThreshold) return;
    const compressed = [];
    const len = this.buckets.length;
    for (let i = 0; i < len; i += 2) {
      const b1 = this.buckets[i];
      const b2 = i + 1 < len ? this.buckets[i + 1] : null;
      if (b2) {
        compressed.push({
          sum: b1.sum + b2.sum,
          sumSquares: b1.sumSquares + b2.sumSquares,
          size: b1.size + b2.size,
          // timestamp: earliest of the two
          timestamp: Math.min(b1.timestamp, b2.timestamp)
        });
      } else {
        // carry last unpaired bucket
        compressed.push(b1);
      }
    }
    this.buckets = compressed;
    // Recalculate stats to keep totals consistent
    this._recalculateStatistics();
  }

  /**
   * Reset ADWIN to its initial state.
   */
  reset() {
    this.buckets = [];
    this.total = 0;
    this.totalSumSquares = 0;
    this.width = 0;
    this.variance = 0;
    this.drift = false;
    this.driftCount = 0;
    this.lastDriftPoint = -1;
  }

  /**
   * Get current statistics for external use.
   * @returns {Object}
   */
  getStatistics() {
    return {
      width: this.width,
      total: this.total,
      mean: this.width > 0 ? this.total / this.width : 0,
      variance: this.variance,
      driftCount: this.driftCount,
      lastDriftPoint: this.lastDriftPoint,
      currentDrift: this.drift,
      bucketCount: this.buckets.length
    };
  }
}

// Export for Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ADWIN;
}
