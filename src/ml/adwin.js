/**
 * ADWIN (Adaptive Windowing) Implementation
 * For concept drift detection in data streams
 */

class ADWIN {
    constructor(delta = 0.002) {
        this.delta = delta; // Confidence parameter
        this.buckets = [];
        this.total = 0;
        this.variance = 0;
        this.width = 0;
        this.drift = false;
        this.driftCount = 0;
        this.lastDriftPoint = -1;
        this.minWindowLength = 5;
    }

    /**
     * Update ADWIN with new data point
     */
    update(value) {
        this.drift = false;
        
        // Add new bucket
        this.addBucket(value);
        
        // Check for drift
        this.checkForDrift();
        
        // Compress buckets if needed
        this.compressBuckets();
    }

    /**
     * Add new bucket with data point
     */
    addBucket(value) {
        const bucket = {
            value: value,
            sum: value,
            sumSquares: value * value,
            size: 1,
            timestamp: Date.now()
        };
        
        this.buckets.push(bucket);
        this.total += value;
        this.width += 1;
        
        // Update variance incrementally
        this.updateVariance();
    }

    /**
     * Update variance calculation
     */
    updateVariance() {
        if (this.width < 2) {
            this.variance = 0;
            return;
        }
        
        const mean = this.total / this.width;
        let sumSquares = 0;
        
        this.buckets.forEach(bucket => {
            sumSquares += bucket.sumSquares;
        });
        
        this.variance = Math.max(0, (sumSquares / this.width) - (mean * mean));
    }

    /**
     * Check for concept drift between different window cuts
     */
    checkForDrift() {
        if (this.width < this.minWindowLength * 2) {
            return;
        }

        let leftSum = 0;
        let leftSumSquares = 0;
        let leftSize = 0;

        // Try different cut points
        for (let i = this.minWindowLength; i < this.width - this.minWindowLength; i++) {
            // Calculate left window statistics
            for (let j = 0; j < i; j++) {
                const bucket = this.buckets[j];
                leftSum += bucket.sum;
                leftSumSquares += bucket.sumSquares;
                leftSize += bucket.size;
            }

            // Calculate right window statistics
            const rightSum = this.total - leftSum;
            const rightSumSquares = this.getTotalSumSquares() - leftSumSquares;
            const rightSize = this.width - leftSize;

            // Calculate means
            const leftMean = leftSum / leftSize;
            const rightMean = rightSum / rightSize;

            // Calculate epsilon threshold
            const epsilon = this.calculateEpsilon(leftSize, rightSize);

            // Check for significant difference
            if (Math.abs(leftMean - rightMean) > epsilon) {
                this.detectDrift();
                this.dropOldBuckets(i);
                return;
            }

            // Reset for next iteration
            leftSum = 0;
            leftSumSquares = 0;
            leftSize = 0;
        }
    }

    /**
     * Calculate epsilon threshold for drift detection
     */
    calculateEpsilon(n1, n2) {
        if (n1 === 0 || n2 === 0) return Infinity;
        
        const harmonicMean = 1 / ((1/n1) + (1/n2));
        const logFactor = Math.log(2 * Math.log(this.width) / this.delta);
        
        return Math.sqrt((2 * this.variance * logFactor) / harmonicMean);
    }

    /**
     * Get total sum of squares
     */
    getTotalSumSquares() {
        return this.buckets.reduce((sum, bucket) => sum + bucket.sumSquares, 0);
    }

    /**
     * Detect drift and update counters
     */
    detectDrift() {
        this.drift = true;
        this.driftCount++;
        this.lastDriftPoint = this.width;
        console.log(`ADWIN: Concept drift detected at point ${this.width}`);
    }

    /**
     * Drop old buckets after drift detection
     */
    dropOldBuckets(cutPoint) {
        const bucketsToKeep = this.buckets.slice(cutPoint);
        this.buckets = bucketsToKeep;
        
        // Recalculate statistics
        this.recalculateStatistics();
    }

    /**
     * Recalculate all statistics after bucket removal
     */
    recalculateStatistics() {
        this.total = 0;
        this.width = 0;
        
        this.buckets.forEach(bucket => {
            this.total += bucket.sum;
            this.width += bucket.size;
        });
        
        this.updateVariance();
    }

    /**
     * Compress buckets to maintain efficiency
     */
    compressBuckets() {
        if (this.buckets.length <= 100) return;
        
        // Merge oldest buckets
        const bucketPairs = [];
        for (let i = 0; i < this.buckets.length - 1; i += 2) {
            const bucket1 = this.buckets[i];
            const bucket2 = this.buckets[i + 1] || { value: 0, sum: 0, sumSquares: 0, size: 0 };
            
            bucketPairs.push({
                value: (bucket1.value + bucket2.value) / 2,
                sum: bucket1.sum + bucket2.sum,
                sumSquares: bucket1.sumSquares + bucket2.sumSquares,
                size: bucket1.size + bucket2.size,
                timestamp: Math.min(bucket1.timestamp, bucket2.timestamp || bucket1.timestamp)
            });
        }
        
        this.buckets = bucketPairs;
    }

    /**
     * Reset ADWIN to initial state
     */
    reset() {
        this.buckets = [];
        this.total = 0;
        this.variance = 0;
        this.width = 0;
        this.drift = false;
        this.driftCount = 0;
        this.lastDriftPoint = -1;
    }

    /**
     * Get current statistics
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

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ADWIN;
}