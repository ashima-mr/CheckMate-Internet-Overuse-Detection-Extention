/**
 * Statistical Process Control (SPC) implementation with missing methods
 * Enhanced for zero-shot anomaly detection
 */

class StatisticalProcessControl {
    constructor(windowSize = 100, sigmaMultiplier = 3) {
        this.windowSize = windowSize;
        this.sigmaMultiplier = sigmaMultiplier;
        this.dataWindow = new CircularBuffer(windowSize);
        this.isInitialized = false;
        this.mean = 0;
        this.standardDeviation = 0;
        this.upperControlLimit = 0;
        this.lowerControlLimit = 0;
        this.anomalyCount = 0;
        this.totalObservations = 0;
    }

    /**
     * Add a new data point and check for anomalies
     */
    addDataPoint(value) {
        if (typeof value !== 'number' || !isFinite(value)) {
            console.warn('Invalid data point:', value);
            return false;
        }

        this.dataWindow.push(value);
        this.totalObservations++;

        if (this.dataWindow.length >= Math.min(30, this.windowSize)) {
            this.updateControlLimits();
            this.isInitialized = true;
        }

        const isAnomaly = this.isInitialized && this.isAnomaly(value);
        if (isAnomaly) {
            this.anomalyCount++;
        }

        return isAnomaly;
    }

    /**
     * Update control limits based on current data window
     */
    updateControlLimits() {
        const data = this.dataWindow.toArray();
        this.mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        
        const variance = data.reduce((sum, val) => sum + Math.pow(val - this.mean, 2), 0) / data.length;
        this.standardDeviation = Math.sqrt(variance);
        
        const margin = this.sigmaMultiplier * this.standardDeviation;
        this.upperControlLimit = this.mean + margin;
        this.lowerControlLimit = this.mean - margin;
    }

    /**
     * Check if a value is an anomaly
     */
    isAnomaly(value) {
        if (!this.isInitialized) return false;
        return value > this.upperControlLimit || value < this.lowerControlLimit;
    }

    /**
     * Get current statistics - MISSING METHOD IMPLEMENTATION
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            mean: this.mean,
            standardDeviation: this.standardDeviation,
            upperControlLimit: this.upperControlLimit,
            lowerControlLimit: this.lowerControlLimit,
            windowSize: this.windowSize,
            currentWindowLength: this.dataWindow.length,
            anomalyCount: this.anomalyCount,
            totalObservations: this.totalObservations,
            anomalyRate: this.totalObservations > 0 ? this.anomalyCount / this.totalObservations : 0,
            sigmaMultiplier: this.sigmaMultiplier,
            lastValue: this.dataWindow.length > 0 ? this.dataWindow.get(this.dataWindow.length - 1) : null
        };
    }

    /**
     * Get control chart data for visualization
     */
    getControlChartData() {
        const data = this.dataWindow.toArray();
        const timestamps = [];
        const values = [];
        const upperLimits = [];
        const lowerLimits = [];
        const meanLine = [];
        const anomalies = [];

        for (let i = 0; i < data.length; i++) {
            timestamps.push(Date.now() - (data.length - i) * 1000); // Approximate timestamps
            values.push(data[i]);
            upperLimits.push(this.upperControlLimit);
            lowerLimits.push(this.lowerControlLimit);
            meanLine.push(this.mean);
            anomalies.push(this.isAnomaly(data[i]));
        }

        return {
            timestamps,
            values,
            upperLimits,
            lowerLimits,
            meanLine,
            anomalies
        };
    }

    /**
     * Calculate process capability indices
     */
    getProcessCapability() {
        if (!this.isInitialized) {
            return null;
        }

        // Cp: Process capability (how well the process fits within specifications)
        const cp = (this.upperControlLimit - this.lowerControlLimit) / (6 * this.standardDeviation);
        
        // Cpk: Process capability index (accounts for process centering)
        const cpkUpper = (this.upperControlLimit - this.mean) / (3 * this.standardDeviation);
        const cpkLower = (this.mean - this.lowerControlLimit) / (3 * this.standardDeviation);
        const cpk = Math.min(cpkUpper, cpkLower);

        return {
            cp: cp,
            cpk: cpk,
            cpkUpper: cpkUpper,
            cpkLower: cpkLower,
            processStability: cpk >= 1.33 ? 'Stable' : cpk >= 1.0 ? 'Marginal' : 'Unstable'
        };
    }

    /**
     * Detect trends in the data
     */
    detectTrends() {
        const data = this.dataWindow.toArray();
        if (data.length < 7) return null;

        // Check for trends (7 consecutive points increasing or decreasing)
        let increasingCount = 0;
        let decreasingCount = 0;
        
        for (let i = 1; i < data.length; i++) {
            if (data[i] > data[i-1]) {
                increasingCount++;
                decreasingCount = 0;
            } else if (data[i] < data[i-1]) {
                decreasingCount++;
                increasingCount = 0;
            } else {
                increasingCount = 0;
                decreasingCount = 0;
            }

            if (increasingCount >= 6) return 'Increasing Trend';
            if (decreasingCount >= 6) return 'Decreasing Trend';
        }

        // Check for runs (8+ consecutive points on same side of centerline)
        let aboveMeanCount = 0;
        let belowMeanCount = 0;

        for (const value of data) {
            if (value > this.mean) {
                aboveMeanCount++;
                belowMeanCount = 0;
            } else if (value < this.mean) {
                belowMeanCount++;
                aboveMeanCount = 0;
            } else {
                aboveMeanCount = 0;
                belowMeanCount = 0;
            }

            if (aboveMeanCount >= 8) return 'Run Above Mean';
            if (belowMeanCount >= 8) return 'Run Below Mean';
        }

        return 'No Trend Detected';
    }

    /**
     * Apply Western Electric rules for additional anomaly detection
     */
    applyWesternElectricRules(value) {
        const data = this.dataWindow.toArray();
        if (!this.isInitialized || data.length < 3) return null;

        const oneThirdSigma = this.standardDeviation / 3;
        const twoThirdsSigma = 2 * oneThirdSigma;
        
        // Rule 1: One point beyond 3-sigma (already covered by isAnomaly)
        if (Math.abs(value - this.mean) > 3 * this.standardDeviation) {
            return 'Rule 1: Point beyond 3-sigma';
        }

        // Rule 2: Two out of three consecutive points beyond 2-sigma
        if (data.length >= 3) {
            const recentThree = data.slice(-3);
            let beyondTwoSigmaCount = 0;
            for (const point of recentThree) {
                if (Math.abs(point - this.mean) > 2 * this.standardDeviation) {
                    beyondTwoSigmaCount++;
                }
            }
            if (beyondTwoSigmaCount >= 2) {
                return 'Rule 2: Two of three points beyond 2-sigma';
            }
        }

        // Rule 3: Four out of five consecutive points beyond 1-sigma
        if (data.length >= 5) {
            const recentFive = data.slice(-5);
            let beyondOneSigmaCount = 0;
            for (const point of recentFive) {
                if (Math.abs(point - this.mean) > this.standardDeviation) {
                    beyondOneSigmaCount++;
                }
            }
            if (beyondOneSigmaCount >= 4) {
                return 'Rule 3: Four of five points beyond 1-sigma';
            }
        }

        return null;
    }

    /**
     * Get anomaly severity score
     */
    getAnomalySeverity(value) {
        if (!this.isInitialized) return 0;

        const deviationFromMean = Math.abs(value - this.mean);
        const sigmaLevel = deviationFromMean / this.standardDeviation;

        if (sigmaLevel > 3) return 1.0; // Critical
        if (sigmaLevel > 2) return 0.8; // High
        if (sigmaLevel > 1) return 0.5; // Medium
        return 0.2; // Low
    }

    /**
     * Reset the SPC system
     */
    reset() {
        this.dataWindow = new CircularBuffer(this.windowSize);
        this.isInitialized = false;
        this.mean = 0;
        this.standardDeviation = 0;
        this.upperControlLimit = 0;
        this.lowerControlLimit = 0;
        this.anomalyCount = 0;
        this.totalObservations = 0;
    }

    /**
     * Export data for analysis
     */
    exportData() {
        return {
            windowData: this.dataWindow.toArray(),
            statistics: this.getStatistics(),
            controlChartData: this.getControlChartData(),
            processCapability: this.getProcessCapability(),
            currentTrend: this.detectTrends()
        };
    }

    /**
     * Import data from previous session
     */
    importData(data) {
        if (!data || !Array.isArray(data.windowData)) {
            console.warn('Invalid import data');
            return false;
        }

        this.reset();
        
        for (const value of data.windowData) {
            this.addDataPoint(value);
        }

        return true;
    }

    /**
     * Get real-time monitoring summary
     */
    getMonitoringSummary() {
        const stats = this.getStatistics();
        const trend = this.detectTrends();
        const capability = this.getProcessCapability();

        return {
            status: this.isInitialized ? 'Active' : 'Initializing',
            anomalyRate: stats.anomalyRate,
            trend: trend,
            stability: capability ? capability.processStability : 'Unknown',
            lastAnomalyTime: this.getLastAnomalyTime(),
            controlLimits: {
                upper: this.upperControlLimit,
                lower: this.lowerControlLimit,
                mean: this.mean
            }
        };
    }

    /**
     * Get timestamp of last anomaly (simplified)
     */
    getLastAnomalyTime() {
        // In a full implementation, this would track actual anomaly timestamps
        return this.anomalyCount > 0 ? Date.now() : null;
    }
}