/**
 * ML Ensemble that combines Statistical Process Control and Isolation Forest
 * for robust zero-shot anomaly detection
 */
class AnomalyDetectionEnsemble {
    constructor(options = {}) {
        this.spcWeight = options.spcWeight || 0.5;
        this.ifWeight = options.ifWeight || 0.5;
        this.threshold = options.threshold || 0.5;

        // Initialize models
        this.spcModel = new StatisticalProcessControl(
            options.spcWindowSize || 100,
            options.sigmaMultiplier || 3
        );

        this.isolationForest = new IsolationForest({
            numberOfTrees: options.numberOfTrees || 15,
            subsampleSize: options.subsampleSize || 64
        });

        this.featureBuffer = [];
        this.maxBufferSize = options.maxBufferSize || 200;
        this.retrainInterval = options.retrainInterval || 50;
        this.dataPointCount = 0;
    }

    /**
     * Process new feature vector and return anomaly prediction
     * @param {Array<number>} features - Feature vector
     * @returns {object} - Prediction result
     */
    predict(features) {
        // Add to buffer for periodic retraining
        this.featureBuffer.push([...features]);
        if (this.featureBuffer.length > this.maxBufferSize) {
            this.featureBuffer.shift();
        }

        // Calculate composite feature for SPC
        const compositeFeature = this.calculateCompositeFeature(features);
        const spcResult = this.spcModel.addDataPoint(compositeFeature);

        // Get Isolation Forest score
        let ifScore = 0;
        if (this.isolationForest.isTrained) {
            try {
                const scores = this.isolationForest.predict([features]);
                ifScore = scores[0];
            } catch (error) {
                console.warn('IF prediction error:', error);
            }
        }

        // Retrain Isolation Forest periodically
        this.dataPointCount++;
        if (this.dataPointCount % this.retrainInterval === 0 && this.featureBuffer.length >= 30) {
            this.retrainIsolationForest();
        }

        // Combine predictions
        const spcFlag = spcResult ? 1 : 0;
        const ifFlag = ifScore > 0.7 ? 1 : 0;

        const combinedScore = (this.spcWeight * spcFlag) + (this.ifWeight * ifFlag);
        const isAnomaly = combinedScore >= this.threshold;

        return {
            isAnomaly,
            combinedScore,
            spcFlag,
            ifScore,
            compositeFeature,
            confidence: Math.abs(combinedScore - 0.5) * 2,
            details: {
                spc: this.spcModel.getStatistics(),
                if: this.isolationForest.getModelInfo()
            }
        };
    }

    /**
     * Calculate composite feature for SPC from feature vector
     * @param {Array<number>} features - Feature vector
     * @returns {number} - Composite feature value
     */
    calculateCompositeFeature(features) {
        // Weighted sum of features with emphasis on problematic patterns
        const weights = [
            0.3, // Session duration weight
            0.25, // Tab switching frequency weight
            0.2, // Focus duration weight
            0.15, // Category score weight
            0.1  // Time-based score weight
        ];

        let composite = 0;
        for (let i = 0; i < Math.min(features.length, weights.length); i++) {
            composite += features[i] * weights[i];
        }

        return composite;
    }

    /**
     * Retrain Isolation Forest with current buffer
     */
    retrainIsolationForest() {
        if (this.featureBuffer.length < 30) return;

        try {
            this.isolationForest.fit(this.featureBuffer);
            console.log('Isolation Forest retrained with', this.featureBuffer.length, 'samples');
        } catch (error) {
            console.warn('IF retraining error:', error);
        }
    }

    /**
     * Update ensemble weights
     * @param {number} spcWeight - Weight for SPC (0-1)
     * @param {number} ifWeight - Weight for IF (0-1)
     */
    updateWeights(spcWeight, ifWeight) {
        const total = spcWeight + ifWeight;
        this.spcWeight = spcWeight / total;
        this.ifWeight = ifWeight / total;
    }

    /**
     * Update detection threshold
     * @param {number} threshold - New threshold (0-1)
     */
    updateThreshold(threshold) {
        this.threshold = Math.max(0, Math.min(1, threshold));
    }

    /**
     * Reset all models
     */
    reset() {
        this.spcModel.reset();
        this.isolationForest = new IsolationForest({
            numberOfTrees: 15,
            subsampleSize: 64
        });
        this.featureBuffer = [];
        this.dataPointCount = 0;
    }

    /**
     * Get ensemble statistics
     * @returns {object} - Ensemble information
     */
    getStats() {
        return {
            spcWeight: this.spcWeight,
            ifWeight: this.ifWeight,
            threshold: this.threshold,
            bufferSize: this.featureBuffer.length,
            dataPointCount: this.dataPointCount,
            spcStats: this.spcModel.getStatistics(),
            ifStats: this.isolationForest.getModelInfo()
        };
    }
}