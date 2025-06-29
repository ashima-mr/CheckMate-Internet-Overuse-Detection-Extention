/**
 * Lightweight Isolation Forest implementation optimized for browser performance
 */
class IsolationForest {
    constructor(options = {}) {
        this.numberOfTrees = options.numberOfTrees || 15;
        this.subsampleSize = options.subsampleSize || 64;
        this.maxHeight = Math.ceil(Math.log2(this.subsampleSize));
        this.trees = [];
        this.isTrained = false;
    }

    fit(data) {
        if (!data || data.length === 0) {
            throw new Error('Training data cannot be empty');
        }

        this.trees = [];
        this.featureCount = data[0].length;

        for (let i = 0; i < this.numberOfTrees; i++) {
            const subsample = this.subsampleData(data);
            const tree = this.buildTree(subsample, 0);
            this.trees.push(tree);
        }

        this.isTrained = true;
    }

    predict(data) {
        if (!this.isTrained) {
            throw new Error('Model must be trained before prediction');
        }
        return data.map(point => this.getAnomalyScore(point));
    }

    getAnomalyScore(point) {
        const avgPathLength = this.trees.reduce((sum, tree) => {
            return sum + this.getPathLength(point, tree, 0);
        }, 0) / this.numberOfTrees;

        const c = this.getAveragePathLength(this.subsampleSize);
        return Math.pow(2, -avgPathLength / c);
    }
}
