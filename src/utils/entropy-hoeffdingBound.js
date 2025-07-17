/**
 * Calculate Shannon entropy for a given class distribution
 * @param {Array<number>} classStats - Array of class counts
 * @returns {number} Shannon entropy value
 */
function calculateEntropy(classStats) {
  if (!classStats || classStats.length === 0) {
    return 0;
  }

  const total = classStats.reduce((sum, count) => sum + count, 0);
  
  if (total === 0) {
    return 0;
  }

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
 * Calculate Hoeffding bound for statistical significance testing
 * @param {number} delta - Confidence parameter (typically 0.01 to 0.001)
 * @param {number} n - Number of observations
 * @param {number} range - Range of the random variable (default: 1 for binary classification)
 * @returns {number} Hoeffding bound value
 */
function HoeffdingBound(delta, n, range = 1) {
  if (n <= 0 || delta <= 0 || delta >= 1) {
    return Infinity;
  }

  // Hoeffding bound formula: sqrt((R^2 * ln(1/δ)) / (2n))
  // where R is the range of the random variable
  return Math.sqrt((range * range * Math.log(1 / delta)) / (2 * n));
}

// Export all functions for CommonJS
module.exports = {
  calculateEntropy,
  HoeffdingBound
};
