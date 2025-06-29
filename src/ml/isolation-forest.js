/**
 * Isolation Forest Implementation for Anomaly Detection
 * Efficient zero-shot anomaly detection for behavioral patterns
 */

class IsolationForest {
    constructor(options = {}) {
        this.numberOfTrees = options.numberOfTrees || 15;
        this.subsampleSize = options.subsampleSize || 64;
        this.maxTreeDepth = options.maxTreeDepth || Math.ceil(Math.log2(this.subsampleSize));
        this.trees = [];
        this.isTrained = false;
        this.featureDimension = 0;
        this.trainingSize = 0;
    }

    /**
     * Train the Isolation Forest on the given dataset
     */
    fit(dataset) {
        if (!dataset || dataset.length === 0) {
            throw new Error('Dataset cannot be empty');
        }

        this.featureDimension = dataset[0].length;
        this.trainingSize = dataset.length;
        this.trees = [];

        // Build isolation trees
        for (let i = 0; i < this.numberOfTrees; i++) {
            const subsample = this.subsample(dataset);
            const tree = this.buildTree(subsample, 0);
            this.trees.push(tree);
        }

        this.isTrained = true;
        console.log(`Isolation Forest trained with ${this.numberOfTrees} trees on ${dataset.length} samples`);
    }

    /**
     * Predict anomaly scores for given samples
     */
    predict(samples) {
        if (!this.isTrained) {
            throw new Error('Model must be trained before prediction');
        }

        return samples.map(sample => this.anomalyScore(sample));
    }

    /**
     * Calculate anomaly score for a single sample
     */
    anomalyScore(sample) {
        if (sample.length !== this.featureDimension) {
            throw new Error(`Sample dimension mismatch. Expected ${this.featureDimension}, got ${sample.length}`);
        }

        let totalPathLength = 0;

        // Calculate average path length across all trees
        this.trees.forEach(tree => {
            totalPathLength += this.pathLength(sample, tree, 0);
        });

        const averagePathLength = totalPathLength / this.numberOfTrees;
        
        // Normalize using expected path length for given sample size
        const expectedPathLength = this.expectedPathLength(this.subsampleSize);
        const normalizedScore = Math.pow(2, -averagePathLength / expectedPathLength);

        return normalizedScore;
    }

    /**
     * Create a random subsample from the dataset
     */
    subsample(dataset) {
        const subsampleSize = Math.min(this.subsampleSize, dataset.length);
        const subsample = [];
        const indices = new Set();

        while (subsample.length < subsampleSize) {
            const randomIndex = Math.floor(Math.random() * dataset.length);
            if (!indices.has(randomIndex)) {
                indices.add(randomIndex);
                subsample.push([...dataset[randomIndex]]);
            }
        }

        return subsample;
    }

    /**
     * Build an isolation tree recursively
     */
    buildTree(dataset, currentDepth) {
        // Base cases for tree termination
        if (dataset.length <= 1 || currentDepth >= this.maxTreeDepth) {
            return {
                type: 'leaf',
                size: dataset.length,
                depth: currentDepth
            };
        }

        // Check if all samples are identical
        if (this.allSamplesIdentical(dataset)) {
            return {
                type: 'leaf',
                size: dataset.length,
                depth: currentDepth
            };
        }

        // Randomly select splitting feature and value
        const splitFeature = Math.floor(Math.random() * this.featureDimension);
        const featureValues = dataset.map(sample => sample[splitFeature]);
        const minValue = Math.min(...featureValues);
        const maxValue = Math.max(...featureValues);

        if (minValue === maxValue) {
            return {
                type: 'leaf',
                size: dataset.length,
                depth: currentDepth
            };
        }

        const splitValue = minValue + Math.random() * (maxValue - minValue);

        // Split dataset
        const leftDataset = [];
        const rightDataset = [];

        dataset.forEach(sample => {
            if (sample[splitFeature] < splitValue) {
                leftDataset.push(sample);
            } else {
                rightDataset.push(sample);
            }
        });

        // Ensure both splits have at least one sample
        if (leftDataset.length === 0 || rightDataset.length === 0) {
            return {
                type: 'leaf',
                size: dataset.length,
                depth: currentDepth
            };
        }

        // Recursively build subtrees
        return {
            type: 'internal',
            splitFeature: splitFeature,
            splitValue: splitValue,
            left: this.buildTree(leftDataset, currentDepth + 1),
            right: this.buildTree(rightDataset, currentDepth + 1),
            depth: currentDepth
        };
    }

    /**
     * Check if all samples in dataset are identical
     */
    allSamplesIdentical(dataset) {
        if (dataset.length <= 1) return true;

        const firstSample = dataset[0];
        return dataset.every(sample => 
            sample.every((value, index) => Math.abs(value - firstSample[index]) < 1e-10)
        );
    }

    /**
     * Calculate path length for a sample through a tree
     */
    pathLength(sample, node, currentDepth) {
        if (node.type === 'leaf') {
            // Add expected path length for remaining samples in leaf
            return currentDepth + this.expectedPathLength(node.size);
        }

        // Navigate to appropriate child
        if (sample[node.splitFeature] < node.splitValue) {
            return this.pathLength(sample, node.left, currentDepth + 1);
        } else {
            return this.pathLength(sample, node.right, currentDepth + 1);
        }
    }

    /**
     * Calculate expected path length for n samples in a binary tree
     */
    expectedPathLength(n) {
        if (n <= 1) return 0;
        if (n === 2) return 1;
        
        // Approximation: E(h(n)) = 2 * (ln(n-1) + euler_constant) - 2 * (n-1) / n
        const eulerConstant = 0.5772156649;
        return 2 * (Math.log(n - 1) + eulerConstant) - (2 * (n - 1) / n);
    }

    /**
     * Get model information and statistics
     */
    getModelInfo() {
        return {
            isTrained: this.isTrained,
            numberOfTrees: this.numberOfTrees,
            subsampleSize: this.subsampleSize,
            maxTreeDepth: this.maxTreeDepth,
            featureDimension: this.featureDimension,
            trainingSize: this.trainingSize,
            averageTreeDepth: this.getAverageTreeDepth(),
            modelComplexity: this.numberOfTrees * this.subsampleSize
        };
    }

    /**
     * Calculate average depth of all trees
     */
    getAverageTreeDepth() {
        if (!this.isTrained || this.trees.length === 0) return 0;

        const totalDepth = this.trees.reduce((sum, tree) => sum + this.getTreeDepth(tree), 0);
        return totalDepth / this.trees.length;
    }

    /**
     * Get maximum depth of a tree
     */
    getTreeDepth(node) {
        if (node.type === 'leaf') {
            return node.depth;
        }

        const leftDepth = this.getTreeDepth(node.left);
        const rightDepth = this.getTreeDepth(node.right);
        return Math.max(leftDepth, rightDepth);
    }

    /**
     * Detect if a sample is an anomaly based on threshold
     */
    isAnomaly(sample, threshold = 0.6) {
        const score = this.anomalyScore(sample);
        return score > threshold;
    }

    /**
     * Reset model to untrained state
     */
    reset() {
        this.trees = [];
        this.isTrained = false;
        this.featureDimension = 0;
        this.trainingSize = 0;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IsolationForest;
}