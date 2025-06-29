/**
 * Enhanced Hoeffding Adaptive Tree implementation with comprehensive monitoring
 * Classes: 0=Productive, 1=Unproductive, 2=Unhealthy
 * Supports user feedback integration, concept drift detection, and visualization
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
        
        // Enhanced monitoring capabilities
        this.predictionHistory = [];
        this.performanceMetrics = {
            accuracyHistory: [],
            driftDetections: [],
            errorRates: [],
            timestamps: []
        };
        
        // Tree structure tracking for visualization
        this.treeStructureHistory = [];
        this.nodeStatistics = new Map();
        
        // Choose drift detector type
        this.driftDetectionMethod = options.driftDetectionMethod || 'SPC';
        if (this.driftDetectionMethod === 'SPC') {
            this.driftDetector = new StatisticalProcessControl(
                options.spcWindowSize || 100,
                options.spcSigmaThreshold || 3
            );
            this.warningDetector = new StatisticalProcessControl(
                options.spcWindowSize || 100,
                options.spcSigmaThreshold || 3
            );
        } else {
            this.driftDetector = new ADWIN(options.adwinDelta || 0.002);
            this.warningDetector = new ADWIN(options.adwinDelta || 0.002);
        }

        this.userFeedbackBuffer = [];
        this.feedbackWeight = 2.0;
        this.adaptationRate = 0.1;
        this.feedbackPromptInterval = 15 * 60 * 1000; // 15 minutes
        this.lastFeedbackTime = 0;
        this.pendingFeedbackRequests = [];
        
        // Initialize monitoring
        this.startTime = Date.now();
        this.driftCount = 0;
    }

    /**
     * Enhanced predict method with monitoring
     */
    predict(features) {
        if (!features || features.length === 0) {
            return {
                prediction: 0,
                confidence: 0.33,
                classDistribution: [0.33, 0.33, 0.34],
                classLabel: this.classLabels[0],
                timestamp: Date.now(),
                nodeId: 'root'
            };
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

        const confidence = totalVotes > 0 ? maxVotes / totalVotes : 0.33;
        const probabilities = totalVotes > 0
            ? classDistribution.map(v => v / totalVotes)
            : [0.33, 0.33, 0.34];

        const predictionResult = {
            prediction: maxClass,
            confidence: confidence,
            classDistribution: probabilities,
            classLabel: this.classLabels[maxClass],
            timestamp: Date.now(),
            nodeId: leafNode.id || 'unknown',
            features: [...features],
            leafPath: this.getPathToLeaf(features)
        };

        // Store prediction for monitoring
        this.predictionHistory.push(predictionResult);
        if (this.predictionHistory.length > 1000) {
            this.predictionHistory.shift();
        }

        return predictionResult;
    }

    /**
     * Enhanced update method with performance tracking
     */
    update(features, actualClass, userFeedback = null) {
        this.instancesSeen++;
        this.featureCount = Math.max(this.featureCount, features.length);

        // Get prediction before update for drift detection
        const prediction = this.predict(features);
        const isCorrect = prediction.prediction === actualClass;
        
        // Track performance metrics
        this.performanceMetrics.accuracyHistory.push(isCorrect ? 1 : 0);
        this.performanceMetrics.errorRates.push(isCorrect ? 0 : 1);
        this.performanceMetrics.timestamps.push(Date.now());
        
        // Keep only recent history
        if (this.performanceMetrics.accuracyHistory.length > 500) {
            this.performanceMetrics.accuracyHistory.shift();
            this.performanceMetrics.errorRates.shift();
            this.performanceMetrics.timestamps.shift();
        }

        // Handle user feedback if provided
        if (userFeedback !== null) {
            this.incorporateUserFeedback(features, actualClass, userFeedback);
        }

        this.checkFeedbackPrompt(features);

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
        
        // Update tree structure history for visualization
        if (this.instancesSeen % 50 === 0) {
            this.captureTreeStructure();
        }

        return {
            updated: true,
            drift: this.driftDetector.drift,
            warning: this.warningDetector.drift,
            needsFeedback: this.shouldPromptForFeedback(),
            accuracy: this.calculateRecentAccuracy(),
            treeDepth: this.getTreeDepth(this.root)
        };
    }

    /**
     * Export tree structure as JSON for visualization
     */
    exportTreeStructure() {
        return this.nodeToJson(this.root);
    }

    /**
     * Convert node to JSON representation
     */
    nodeToJson(node, depth = 0) {
        if (!node) return null;

        const json = {
            id: node.id || `node_${depth}_${Date.now()}`,
            splitFeature: node.splitFeature,
            splitValue: node.splitValue,
            classStats: [...node.classStats],
            instanceCount: node.instanceCount,
            depth: depth,
            isLeaf: node.isLeaf(),
            confidence: this.calculateNodeConfidence(node)
        };

        if (!node.isLeaf() && (node.leftChild || node.rightChild)) {
            json.children = [
                this.nodeToJson(node.leftChild, depth + 1),
                this.nodeToJson(node.rightChild, depth + 1)
            ].filter(x => x);
        }

        return json;
    }

    /**
     * Get path from root to leaf for given features
     */
    getPathToLeaf(features) {
        const path = [];
        let currentNode = this.root;
        let depth = 0;

        while (currentNode && !currentNode.isLeaf()) {
            path.push({
                nodeId: currentNode.id || `node_${depth}`,
                splitFeature: currentNode.splitFeature,
                splitValue: currentNode.splitValue,
                decision: features[currentNode.splitFeature] <= currentNode.splitValue ? 'left' : 'right'
            });

            if (features[currentNode.splitFeature] <= currentNode.splitValue) {
                currentNode = currentNode.leftChild;
            } else {
                currentNode = currentNode.rightChild;
            }
            depth++;
        }

        if (currentNode) {
            path.push({
                nodeId: currentNode.id || `leaf_${depth}`,
                isLeaf: true,
                classStats: [...currentNode.classStats]
            });
        }

        return path;
    }

    /**
     * Calculate node confidence
     */
    calculateNodeConfidence(node) {
        if (!node || node.instanceCount === 0) return 0;
        const maxClass = Math.max(...node.classStats);
        return maxClass / node.instanceCount;
    }

    /**
     * Capture current tree structure for history
     */
    captureTreeStructure() {
        const structure = {
            timestamp: Date.now(),
            instancesSeen: this.instancesSeen,
            treeDepth: this.getTreeDepth(this.root),
            leafCount: this.getLeafCount(this.root),
            structure: this.exportTreeStructure()
        };
        
        this.treeStructureHistory.push(structure);
        if (this.treeStructureHistory.length > 100) {
            this.treeStructureHistory.shift();
        }
    }

    /**
     * Calculate recent accuracy
     */
    calculateRecentAccuracy() {
        if (this.performanceMetrics.accuracyHistory.length === 0) return 0;
        const recent = this.performanceMetrics.accuracyHistory.slice(-50);
        return recent.reduce((sum, acc) => sum + acc, 0) / recent.length;
    }

    /**
     * Enhanced statistics with visualization data
     */
    getStats() {
        return {
            instancesSeen: this.instancesSeen,
            treeDepth: this.getTreeDepth(this.root),
            leafCount: this.getLeafCount(this.root),
            userFeedbackCount: this.userFeedbackBuffer.length,
            driftCount: this.driftCount,
            pendingFeedbackRequests: this.pendingFeedbackRequests.length,
            classDistribution: this.getOverallClassDistribution(),
            accuracy: this.calculateRecentAccuracy(),
            uptime: Date.now() - this.startTime,
            performanceMetrics: this.performanceMetrics,
            treeStructureHistory: this.treeStructureHistory,
            recentPredictions: this.predictionHistory.slice(-20)
        };
    }

    /**
     * Get visualization data for dashboard
     */
    getVisualizationData() {
        return {
            treeStructure: this.exportTreeStructure(),
            performanceTimeSeries: this.performanceMetrics,
            predictionHistory: this.predictionHistory.slice(-100),
            driftHistory: this.performanceMetrics.driftDetections,
            classDistribution: this.getOverallClassDistribution(),
            nodeStatistics: Array.from(this.nodeStatistics.entries())
        };
    }

    // [Rest of the existing methods remain the same...]
    
    checkFeedbackPrompt(features) {
        const now = Date.now();
        const timeSinceLastFeedback = now - this.lastFeedbackTime;

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

    getCurrentSessionContext() {
        return {
            sessionDuration: Date.now() - (this.sessionStartTime || Date.now()),
            instancesSeen: this.instancesSeen,
            recentPredictions: this.getRecentPredictions(5)
        };
    }

    processSessionFeedback(sessionLabel, reasoning = '') {
        const feedback = {
            sessionLabel: sessionLabel,
            classValue: this.sessionLabelToClass(sessionLabel),
            timestamp: Date.now(),
            reasoning: reasoning,
            confidence: 1.0
        };

        const recentInstances = this.getRecentInstances(10);
        recentInstances.forEach(instance => {
            this.incorporateUserFeedback(
                instance.features,
                instance.actualClass,
                feedback
            );
        });

        this.pendingFeedbackRequests = [];
        return feedback;
    }

    sessionLabelToClass(sessionLabel) {
        const labelMap = {
            'productive': 0,
            'non-productive': 1,
            'overuse': 2
        };
        return labelMap[sessionLabel.toLowerCase()] || 1;
    }

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

        if (userFeedback.classValue !== actualClass) {
            for (let i = 0; i < this.feedbackWeight; i++) {
                this.updateTree(features, userFeedback.classValue);
            }
        }

        if (this.userFeedbackBuffer.length > 200) {
            this.userFeedbackBuffer.shift();
        }
    }

    updateTree(features, actualClass) {
        const leafNode = this.findLeaf(features, this.root);
        leafNode.updateStats(features, actualClass);

        if (leafNode.shouldSplit(this.gracePeriod, this.hoeffdingBound)) {
            this.splitLeaf(leafNode, features);
        }
    }

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

    handleConceptDrift() {
        console.log('Concept drift detected, adapting tree...');
        this.driftCount++;
        this.performanceMetrics.driftDetections.push({
            timestamp: Date.now(),
            instancesSeen: this.instancesSeen,
            type: 'concept_drift'
        });
        
        this.root = new HoeffdingNode();
        this.retrainWithFeedback();
        this.driftDetector.reset();
        this.warningDetector.reset();
    }

    handleWarning() {
        console.log('Warning: Potential concept drift detected');
        this.performanceMetrics.driftDetections.push({
            timestamp: Date.now(),
            instancesSeen: this.instancesSeen,
            type: 'warning'
        });
    }

    retrainWithFeedback() {
        const recentFeedback = this.userFeedbackBuffer.slice(-100);
        for (const feedback of recentFeedback) {
            for (let i = 0; i < Math.ceil(feedback.confidence * this.feedbackWeight); i++) {
                this.updateTree(feedback.features, feedback.userCorrection);
            }
        }
    }

    shouldPromptForFeedback() {
        return this.pendingFeedbackRequests.length > 0;
    }

    getPendingFeedbackRequests() {
        return this.pendingFeedbackRequests;
    }

    getOverallClassDistribution() {
        const distribution = [0, 0, 0];
        this.userFeedbackBuffer.forEach(feedback => {
            if (feedback.userCorrection >= 0 && feedback.userCorrection < 3) {
                distribution[feedback.userCorrection]++;
            }
        });
        return distribution;
    }

    getTreeDepth(node, depth = 0) {
        if (!node || node.isLeaf()) {
            return depth;
        }

        const leftDepth = this.getTreeDepth(node.leftChild, depth + 1);
        const rightDepth = this.getTreeDepth(node.rightChild, depth + 1);
        return Math.max(leftDepth, rightDepth);
    }

    getLeafCount(node) {
        if (!node) return 0;
        if (node.isLeaf()) return 1;
        return this.getLeafCount(node.leftChild) + this.getLeafCount(node.rightChild);
    }

    getRecentPredictions(count = 10) {
        return this.predictionHistory.slice(-count);
    }

    getRecentInstances(count = 10) {
        // Simplified implementation - in real scenario, you'd track actual instances
        return this.predictionHistory.slice(-count).map(pred => ({
            features: pred.features,
            actualClass: pred.prediction // Using prediction as proxy
        }));
    }

    reset() {
        this.root = new HoeffdingNode();
        this.instancesSeen = 0;
        this.userFeedbackBuffer = [];
        this.pendingFeedbackRequests = [];
        this.predictionHistory = [];
        this.performanceMetrics = {
            accuracyHistory: [],
            driftDetections: [],
            errorRates: [],
            timestamps: []
        };
        this.treeStructureHistory = [];
        this.driftDetector.reset();
        this.warningDetector.reset();
        this.startTime = Date.now();
        this.driftCount = 0;
    }
}

/**
 * Enhanced Node class with monitoring capabilities
 */
class HoeffdingNode {
    constructor() {
        this.classStats = new Array(3).fill(0);
        this.featureStats = new Map();
        this.splitFeature = null;
        this.splitValue = null;
        this.leftChild = null;
        this.rightChild = null;
        this.instanceCount = 0;
        this.id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.creationTime = Date.now();
    }

    isLeaf() {
        return this.leftChild === null && this.rightChild === null;
    }

    updateStats(features, classLabel) {
        this.instanceCount++;
        if (classLabel >= 0 && classLabel < 3) {
            this.classStats[classLabel]++;
        }

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

    shouldSplit(gracePeriod, hoeffdingBound) {
        if (this.instanceCount < gracePeriod) {
            return false;
        }

        const bestSplit = this.findBestSplit(hoeffdingBound);
        return bestSplit !== null;
    }

    findBestSplit(hoeffdingBound) {
        let bestGain = -Infinity;
        let bestSplit = null;

        for (const [feature, stats] of this.featureStats.entries()) {
            if (stats.count < 2) continue;
            
            const mean = stats.sum / stats.count;
            const gain = this.calculateInfoGain(feature, mean);
            
            if (gain > bestGain) {
                bestGain = gain;
                bestSplit = { feature, value: mean, gain };
            }
        }

        const hoeffdingValue = Math.sqrt(Math.log(1/hoeffdingBound) / (2 * this.instanceCount));
        if (bestGain > hoeffdingValue) {
            return bestSplit;
        }

        return null;
    }

    calculateInfoGain(feature, splitValue) {
        const totalEntropy = this.calculateEntropy(this.classStats);
        
        const leftStats = new Array(3).fill(0);
        const rightStats = new Array(3).fill(0);
        const leftCount = Math.floor(this.instanceCount / 2);
        const rightCount = this.instanceCount - leftCount;

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

    getClassDistribution() {
        return [...this.classStats];
    }

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
    module.exports = { HoeffdingTree, HoeffdingNode };
}
