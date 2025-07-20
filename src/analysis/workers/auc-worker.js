/**
 * Web Worker for AUC/ROC calculations
 * Handles computationally intensive AUC calculations
 */

class AUCCalculator {
  constructor() {
    this.cache = new Map();
  }

  calculateAUC(predictions, labels) {
    if (predictions.length !== labels.length) {
      throw new Error('Predictions and labels must have same length');
    }

    const n = predictions.length;
    if (n === 0) return 0.5;

    // Create pairs and sort by prediction score (descending)
    const pairs = predictions.map((pred, i) => ({ pred, label: labels[i], index: i }));
    pairs.sort((a, b) => b.pred - a.pred);

    // Calculate ROC curve points
    const rocPoints = this.calculateROCPoints(pairs);
    
    // Calculate AUC using trapezoidal rule
    const auc = this.trapezoidalAUC(rocPoints);
    
    return {
      auc,
      rocPoints,
      nSamples: n,
      nPositive: labels.filter(l => l === 1).length,
      nNegative: labels.filter(l => l === 0).length
    };
  }

  calculateROCPoints(sortedPairs) {
    const totalPositives = sortedPairs.filter(p => p.label === 1).length;
    const totalNegatives = sortedPairs.length - totalPositives;
    
    if (totalPositives === 0 || totalNegatives === 0) {
      return [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }];
    }

    let tp = 0, fp = 0;
    const rocPoints = [{ fpr: 0, tpr: 0 }];

    for (let i = 0; i < sortedPairs.length; i++) {
      if (sortedPairs[i].label === 1) {
        tp++;
      } else {
        fp++;
      }

      // Add point if this is the last sample or next sample has different prediction
      if (i === sortedPairs.length - 1 || sortedPairs[i].pred !== sortedPairs[i + 1].pred) {
        rocPoints.push({
          fpr: fp / totalNegatives,
          tpr: tp / totalPositives,
          threshold: sortedPairs[i].pred
        });
      }
    }

    return rocPoints;
  }

  trapezoidalAUC(rocPoints) {
    let auc = 0;
    for (let i = 1; i < rocPoints.length; i++) {
      const width = rocPoints[i].fpr - rocPoints[i - 1].fpr;
      const height = (rocPoints[i].tpr + rocPoints[i - 1].tpr) / 2;
      auc += width * height;
    }
    return auc;
  }

  calculateMultiClassAUC(predictions, labels, classes) {
    const results = {};
    
    classes.forEach(cls => {
      // One-vs-rest approach
      const binaryLabels = labels.map(l => l === cls ? 1 : 0);
      const classPreds = predictions.map(p => p[cls] || 0);
      
      results[cls] = this.calculateAUC(classPreds, binaryLabels);
    });

    // Calculate macro-average AUC
    const aucs = Object.values(results).map(r => r.auc);
    const macroAUC = aucs.reduce((sum, auc) => sum + auc, 0) / aucs.length;

    return {
      classResults: results,
      macroAUC,
      nClasses: classes.length
    };
  }

  calculatePrecisionRecallAUC(predictions, labels) {
    const n = predictions.length;
    const pairs = predictions.map((pred, i) => ({ pred, label: labels[i] }));
    pairs.sort((a, b) => b.pred - a.pred);

    const totalPositives = labels.filter(l => l === 1).length;
    if (totalPositives === 0) return 0;

    let tp = 0, fp = 0;
    const prPoints = [];

    for (let i = 0; i < n; i++) {
      if (pairs[i].label === 1) {
        tp++;
      } else {
        fp++;
      }

      const precision = tp / (tp + fp);
      const recall = tp / totalPositives;
      
      prPoints.push({ precision, recall, threshold: pairs[i].pred });
    }

    // Calculate AUC using trapezoidal rule for PR curve
    let auc = 0;
    for (let i = 1; i < prPoints.length; i++) {
      const width = Math.abs(prPoints[i].recall - prPoints[i - 1].recall);
      const height = (prPoints[i].precision + prPoints[i - 1].precision) / 2;
      auc += width * height;
    }

    return {
      auc,
      prPoints,
      averagePrecision: auc
    };
  }
}

const calculator = new AUCCalculator();

self.onmessage = function(e) {
  const { type, predictions, labels, classes, id } = e.data;

  try {
    let result;

    switch (type) {
      case 'calculateAUC':
        result = calculator.calculateAUC(predictions, labels);
        break;

      case 'calculateMultiClassAUC':
        result = calculator.calculateMultiClassAUC(predictions, labels, classes);
        break;

      case 'calculatePrecisionRecallAUC':
        result = calculator.calculatePrecisionRecallAUC(predictions, labels);
        break;

      default:
        throw new Error(`Unknown AUC calculation type: ${type}`);
    }

    self.postMessage({
      type: `${type}Result`,
      result,
      id,
      timestamp: Date.now()
    });

  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message,
      id
    });
  }
};
