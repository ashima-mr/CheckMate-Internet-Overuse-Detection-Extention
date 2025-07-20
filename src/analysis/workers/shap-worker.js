/**
 * Web Worker for SHAP value calculations
 * Handles heavy Shapley value computations
 */

class ShapleyCalculator {
  constructor() {
    this.cache = new Map();
  }

  calculateTwoPlayerShapley(player1Contrib, player2Contrib, coalitionValue) {
    // All possible coalitions for 2 players
    const coalitions = [
      { players: [], value: 0 },
      { players: [1], value: player1Contrib },
      { players: [2], value: player2Contrib },
      { players: [1, 2], value: coalitionValue }
    ];

    // Calculate marginal contributions
    const player1Marginals = [
      coalitions[1].value - coalitions[0].value,  // {1} - {}
      coalitions[3].value - coalitions[2].value   // {1,2} - {2}
    ];

    const player2Marginals = [
      coalitions[2].value - coalitions[0].value,  // {2} - {}
      coalitions[3].value - coalitions[1].value   // {1,2} - {1}
    ];

    // Shapley values are average marginal contributions
    const shapley1 = (player1Marginals[0] + player1Marginals[1]) / 2;
    const shapley2 = (player2Marginals[0] + player2Marginals[1]) / 2;

    return {
      player1: shapley1,
      player2: shapley2,
      sum: shapley1 + shapley2,
      efficiency: Math.abs((shapley1 + shapley2) - coalitionValue) < 0.001
    };
  }

  calculateFeatureShap(features, baselineFeatures, modelOutput, baselineOutput) {
    const shapValues = {};
    const totalContribution = modelOutput - baselineOutput;

    // Simplified SHAP calculation for feature importance
    const featureNames = [
      'scrollRate', 'clickRate', 'keyRate', 'mouseMoveRate',
      'interactionFreq', 'visible', 'mspc_s1', 'mspc_s2', 'mspc_s3',
      'mspc_s4', 'mspc_s5', 'mspc_s6', 'timeSinceLast', 'activityScore',
      'domainDiversity', 'focusRatio'
    ];

    let allocatedContribution = 0;

    features.forEach((value, index) => {
      const featureName = featureNames[index] || `feature_${index}`;
      const baselineValue = baselineFeatures[index] || 0;
      const featureDiff = value - baselineValue;
      
      // Weight by feature importance (simplified)
      const importance = this.getFeatureImportanceWeight(index);
      const contribution = featureDiff * importance;
      
      shapValues[featureName] = contribution;
      allocatedContribution += contribution;
    });

    // Ensure contributions sum to total (efficiency property)
    const residual = totalContribution - allocatedContribution;
    if (Math.abs(residual) > 0.001) {
      const adjustmentPerFeature = residual / features.length;
      Object.keys(shapValues).forEach(key => {
        shapValues[key] += adjustmentPerFeature;
      });
    }

    return shapValues;
  }

  getFeatureImportanceWeight(index) {
    // Empirically determined weights for each feature
    const weights = [
      0.12, 0.15, 0.10, 0.08,  // interaction rates
      0.18, 0.05,              // interaction freq, visibility
      0.06, 0.06, 0.06, 0.06, 0.06, 0.06,  // MSPC components
      0.14, 0.12, 0.08, 0.10   // time, activity, domain, focus
    ];
    return weights[index] || 0.06;
  }
}

const calculator = new ShapleyCalculator();

self.onmessage = function(e) {
  const { type, data, id } = e.data;

  try {
    let result;

    switch (type) {
      case 'calculateShapley':
        result = calculator.calculateTwoPlayerShapley(
          data.mspcContrib,
          data.hatContrib,
          data.ensembleOutput
        );
        break;

      case 'calculateFeatureShap':
        result = calculator.calculateFeatureShap(
          data.features,
          data.baseline,
          data.modelOutput,
          data.baselineOutput
        );
        break;

      default:
        throw new Error(`Unknown calculation type: ${type}`);
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
