/**
 * Hoeffding Adaptive Tree implementation for online learning with concept drift detection
 * Better suited for user feedback integration compared to ensemble methods
 */

class Hoeffdingtree {
    constructor(options = {}) {
        this.gracePeriod = options.gracePeriod || 200;
        this.hoeffdingBound = options.hoeffdingBound || 0.05;
        this.driftDetectionMethod = options.driftDetectionMethod || 'ADWIN';
        this.warningDetectionMethod = options.warningDetectionMethod || 'ADWIN';
        
        this.root = new HoeffdingNode();
        this.numClasses = 2; // Binary classification for overuse detection
        this.featureCount = 0;
        this.instancesSeen = 0;
        this.driftDetector = new ADWIN();
        this.warningDetector = new ADWIN();
        
        this.userFeedbackBuffer = [];
        this.feedbackWeight = 2.0; // Weight given to user feedback
        this.adaptationRate = 0.1;
    }

    /**
     * Predict class for given features
     */
    predict(features) {
        if (!features || features.length === 0) {
            return { prediction: 0, confidence: 0.5 };
        }
        
        const leafNode = this.findLeaf(features, this.root);
        const classDistribution = leafNode.getClassDistribution();
        
        let maxClass = 0;
        let maxVotes = 0;
        let totalVotes = 0;
        
        for (let i = 0; i < this.numClasses; i++) {
            const votes = classDistribution[i] || 0;
            totalVotes += votes;
            if (votes > maxVotes) {
                maxVotes = votes;
                maxClass = i;
            }
        }
        
        const confidence = totalVotes > 0 ? maxVotes / totalVotes : 0.5;
        
        return {
            prediction: maxClass,
            confidence: confidence,
            classDistribution: classDistribution
        };
    }

    /**
     * Update the tree with new instance and handle user feedback
     */
    update(features, actualClass, userFeedback = null) {
        this.instancesSeen++;
        this.featureCount = Math.max(this.featureCount, features.length);
        
        // Handle user feedback if provided
        if (userFeedback !== null) {
            this.incorporateUserFeedback(features, actualClass, userFeedback);
        }
        
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
            warning: this.warningDetector.drift
        };
    }

    /**
     * Incorporate user feedback into the learning process
     */
    incorporateUserFeedback(features, actualClass, userFeedback) {
        const feedback = {
            features: [...features],
            actualClass: actualClass,
            userCorrection: userFeedback.correctClass,
            confidence: userFeedback.confidence || 1.0,
            timestamp: Date.now()
        };
        
        this.userFeedbackBuffer.push(feedback);
        
        // Apply immediate correction with higher weight
        if (userFeedback.correctClass !== actualClass) {
            // Update with corrected class and higher weight
            for (let i = 0; i < this.feedbackWeight; i++) {
                this.updateTree(features, userFeedback.correctClass);
            }
        }
        
        // Keep buffer size manageable
        if (this.userFeedbackBuffer.length > 100) {
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
            
            // Redistribute instances to children
            leafNode.redistributeInstances();
        }
    }

    /**
     * Handle concept drift by resetting tree
     */
    handleConceptDrift() {
        console.log('Concept drift detected, adapting tree...');
        
        // Reset tree but keep user feedback for retraining
        this.root = new HoeffdingNode();
        
        // Retrain with recent user feedback
        this.retrainWithFeedback();
        
        // Reset drift detector
        this.driftDetector.reset();
        this.warningDetector.reset();
    }

    /**
     * Handle warning by preparing for potential drift
     */
    handleWarning() {
        console.log('Warning: Potential concept drift detected');
        // Could implement alternative tree here for comparison
    }

    /**
     * Retrain the tree with user feedback
     */
    retrainWithFeedback() {
        const recentFeedback = this.userFeedbackBuffer.slice(-50); // Use last 50 feedback items
        
        for (const feedback of recentFeedback) {
            for (let i = 0; i < Math.ceil(feedback.confidence * this.feedbackWeight); i++) {
                this.updateTree(feedback.features, feedback.userCorrection);
            }
        }
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
            adaptationRate: this.adaptationRate
        };
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
        this.driftDetector.reset();
        this.warningDetector.reset();
    }
}

/**
 * Node class for Hoeffding Tree
 */
class HoeffdingNode {
    constructor() {
        this.classStats = new Array(2).fill(0); // Binary classification
        this.featureStats = new Map(); // feature -> {sum, sumSquared, count}
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
        this.classStats[classLabel]++;
        
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
     * Calculate information gain for a split
     */
    calculateInfoGain(feature, splitValue) {
        const totalEntropy = this.calculateEntropy(this.classStats);
        
        const leftStats = new Array(2).fill(0);
        const rightStats = new Array(2).fill(0);
        
        // This is a simplified version - in practice, you'd need to track
        // per-class feature values to calculate proper splits
        const leftCount = Math.floor(this.instanceCount / 2);
        const rightCount = this.instanceCount - leftCount;
        
        // Simplified distribution
        leftStats[0] = Math.floor(this.classStats[0] * leftCount / this.instanceCount);
        leftStats[1] = leftCount - leftStats[0];
        rightStats[0] = this.classStats[0] - leftStats[0];
        rightStats[1] = this.classStats[1] - leftStats[1];
        
        const leftEntropy = this.calculateEntropy(leftStats);
        const rightEntropy = this.calculateEntropy(rightStats);
        
        const weightedEntropy = (leftCount / this.instanceCount) * leftEntropy +
                               (rightCount / this.instanceCount) * rightEntropy;
        
        return totalEntropy - weightedEntropy;
    }

    /**
     * Calculate entropy for class distribution
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
        // In a full implementation, this would redistribute stored instances
        // For now, we'll just initialize children
        if (this.leftChild) {
            this.leftChild.instanceCount = Math.floor(this.instanceCount / 2);
        }
        if (this.rightChild) {
            this.rightChild.instanceCount = this.instanceCount - this.leftChild.instanceCount;
        }
    }
}

/**
 * ADWIN (Adaptive Windowing) for concept drift detection
 */
class ADWIN {
    constructor(delta = 0.002) {
        this.delta = delta;
        this.buckets = [];
        this.drift = false;
        this.driftCount = 0;
        this.total = 0;
        this.variance = 0;
        this.width = 0;
    }

    /**
     * Update with new value (0 for correct, 1 for error)
     */
    update(value) {
        this.drift = false;
        
        // Add new bucket
        this.buckets.push({
            value: value,
            timestamp: Date.now()
        });
        
        this.total += value;
        this.width++;
        
        // Check for drift
        if (this.width >= 2) {
            this.detectDrift();
        }
        
        // Maintain window size
        if (this.buckets.length > 1000) {
            const removed = this.buckets.shift();
            this.total -= removed.value;
            this.width--;
        }
    }

    /**
     * Detect concept drift using ADWIN algorithm
     */
    detectDrift() {
        if (this.width < 10) return;
        
        const mean = this.total / this.width;
        let maxDiff = 0;
        
        // Check all possible splits
        for (let i = 1; i < this.width - 1; i++) {
            const leftSum = this.buckets.slice(0, i).reduce((sum, b) => sum + b.value, 0);
            const rightSum = this.total - leftSum;
            
            const leftMean = leftSum / i;
            const rightMean = rightSum / (this.width - i);
            
            const diff = Math.abs(leftMean - rightMean);
            maxDiff = Math.max(maxDiff, diff);
        }
        
        // Simplified drift threshold
        const threshold = Math.sqrt(2 * Math.log(2/this.delta) / this.width);
        
        if (maxDiff > threshold) {
            this.drift = true;
            this.driftCount++;
            
            // Remove older half of window
            const cutpoint = Math.floor(this.width / 2);
            const removed = this.buckets.splice(0, cutpoint);
            this.total -= removed.reduce((sum, b) => sum + b.value, 0);
            this.width -= cutpoint;
        }
    }

    /**
     * Reset the drift detector
     */
    reset() {
        this.buckets = [];
        this.drift = false;
        this.total = 0;
        this.width = 0;
    }
}