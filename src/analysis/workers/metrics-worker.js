/**
 * Web Worker for heavy metrics calculations
 * Handles statistical computations and data analysis
 */

class MetricsProcessor {
  constructor() {
    this.histogramCache = new Map();
  }

  processPerformanceMetrics(data) {
    const latencies = data.latencies || [];
    const memoryUsage = data.memoryUsage || [];
    const cpuUsage = data.cpuUsage || [];

    return {
      latency: this.calculateStatistics(latencies),
      memory: this.calculateStatistics(memoryUsage),
      cpu: this.calculateStatistics(cpuUsage),
      correlations: this.calculateCorrelations({
        latency: latencies,
        memory: memoryUsage,
        cpu: cpuUsage
      })
    };
  }

  calculateStatistics(data) {
    if (data.length === 0) return null;

    const sorted = [...data].sort((a, b) => a - b);
    const n = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    
    // Calculate variance and standard deviation
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: n,
      sum,
      mean,
      median: n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)],
      min: sorted[0],
      max: sorted[n - 1],
      variance,
      stdDev,
      q25: sorted[Math.floor(n * 0.25)],
      q75: sorted[Math.floor(n * 0.75)],
      iqr: sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)],
      skewness: this.calculateSkewness(data, mean, stdDev),
      kurtosis: this.calculateKurtosis(data, mean, stdDev)
    };
  }

  calculateSkewness(data, mean, stdDev) {
    if (stdDev === 0) return 0;
    const n = data.length;
    const skewness = data.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0) / n;
    return skewness;
  }

  calculateKurtosis(data, mean, stdDev) {
    if (stdDev === 0) return 0;
    const n = data.length;
    const kurtosis = data.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 4), 0) / n;
    return kurtosis - 3; // Excess kurtosis
  }

  calculateCorrelations(datasets) {
    const keys = Object.keys(datasets);
    const correlations = {};
    
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const key1 = keys[i];
        const key2 = keys[j];
        correlations[`${key1}_${key2}`] = this.pearsonCorrelation(
          datasets[key1], 
          datasets[key2]
        );
      }
    }
    
    return correlations;
  }

  pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    
    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  createAdvancedHistogram(data, bins = 'auto') {
    if (data.length === 0) return null;
    
    const cacheKey = `${JSON.stringify(data)}_${bins}`;
    if (this.histogramCache.has(cacheKey)) {
      return this.histogramCache.get(cacheKey);
    }
    
    // Determine optimal number of bins
    let numBins = bins;
    if (bins === 'auto') {
      // Sturges' rule
      numBins = Math.ceil(Math.log2(data.length)) + 1;
      // Freedman-Diaconis rule (alternative)
      const stats = this.calculateStatistics(data);
      const fdBins = Math.ceil((stats.max - stats.min) / (2 * stats.iqr * Math.pow(data.length, -1/3)));
      numBins = Math.max(1, Math.min(numBins, fdBins));
    }
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / numBins;
    
    const histogram = Array(numBins).fill(0).map((_, i) => ({
      bin: i,
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      density: 0,
      percentage: 0
    }));
    
    // Fill histogram
    data.forEach(value => {
      let binIndex = Math.floor((value - min) / binWidth);
      binIndex = Math.max(0, Math.min(binIndex, numBins - 1));
      histogram[binIndex].count++;
    });
    
    // Calculate density and percentage
    histogram.forEach(bin => {
      bin.density = bin.count / (data.length * binWidth);
      bin.percentage = (bin.count / data.length) * 100;
    });
    
    const result = {
      histogram,
      binWidth,
      totalSamples: data.length,
      statistics: this.calculateStatistics(data)
    };
    
    this.histogramCache.set(cacheKey, result);
    return result;
  }

  detectAnomalies(data, method = 'iqr') {
    const stats = this.calculateStatistics(data);
    const anomalies = [];
    
    switch (method) {
      case 'iqr':
        const iqrMultiplier = 1.5;
        const lowerBound = stats.q25 - iqrMultiplier * stats.iqr;
        const upperBound = stats.q75 + iqrMultiplier * stats.iqr;
        
        data.forEach((value, index) => {
          if (value < lowerBound || value > upperBound) {
            anomalies.push({
              index,
              value,
              type: value < lowerBound ? 'low' : 'high',
              severity: Math.abs(value - stats.median) / stats.stdDev
            });
          }
        });
        break;
        
      case 'zscore':
        const zThreshold = 3;
        data.forEach((value, index) => {
          const zScore = Math.abs(value - stats.mean) / stats.stdDev;
          if (zScore > zThreshold) {
            anomalies.push({
              index,
              value,
              zScore,
              type: value > stats.mean ? 'high' : 'low',
              severity: zScore
            });
          }
        });
        break;
    }
    
    return {
      anomalies,
      method,
      totalAnomalies: anomalies.length,
      anomalyRate: anomalies.length / data.length
    };
  }

  calculateTimeSeriesMetrics(timeSeriesData) {
    if (timeSeriesData.length < 2) return null;
    
    // Calculate differences for trend analysis
    const values = timeSeriesData.map(d => d.value);
    const timestamps = timeSeriesData.map(d => d.timestamp);
    const differences = [];
    
    for (let i = 1; i < values.length; i++) {
      differences.push(values[i] - values[i - 1]);
    }
    
    // Linear regression for trend
    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    
    const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (values[i] - meanY), 0);
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);
    
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = meanY - slope * meanX;
    const r2 = this.calculateR2(x, values, slope, intercept);
    
    return {
      trend: {
        slope,
        intercept,
        r2,
        direction: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable'
      },
      volatility: this.calculateStatistics(differences),
      autocorrelation: this.calculateAutocorrelation(values, 1),
      seasonality: this.detectSeasonality(values)
    };
  }

  calculateR2(x, y, slope, intercept) {
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    const totalSumSquares = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const residualSumSquares = y.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    
    return totalSumSquares === 0 ? 0 : 1 - (residualSumSquares / totalSumSquares);
  }

  calculateAutocorrelation(data, lag) {
    if (data.length <= lag) return 0;
    
    const n = data.length - lag;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (data[i] - mean) * (data[i + lag] - mean);
    }
    
    for (let i = 0; i < data.length; i++) {
      denominator += Math.pow(data[i] - mean, 2);
    }
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  detectSeasonality(data, period = null) {
    // Simple seasonality detection using autocorrelation
    if (!period) {
      // Try common periods
      const periods = [7, 24, 30, 60]; // daily, hourly patterns etc
      let maxCorr = 0;
      let bestPeriod = null;
      
      periods.forEach(p => {
        if (data.length > p) {
          const corr = this.calculateAutocorrelation(data, p);
          if (Math.abs(corr) > Math.abs(maxCorr)) {
            maxCorr = corr;
            bestPeriod = p;
          }
        }
      });
      
      return {
        detected: Math.abs(maxCorr) > 0.3,
        period: bestPeriod,
        strength: maxCorr
      };
    }
    
    const correlation = this.calculateAutocorrelation(data, period);
    return {
      detected: Math.abs(correlation) > 0.3,
      period,
      strength: correlation
    };
  }
}

const processor = new MetricsProcessor();

self.onmessage = function(e) {
  const { type, data, options, id } = e.data;

  try {
    let result;

    switch (type) {
      case 'processPerformanceMetrics':
        result = processor.processPerformanceMetrics(data);
        break;

      case 'createHistogram':
        result = processor.createAdvancedHistogram(data.values, options?.bins);
        break;

      case 'detectAnomalies':
        result = processor.detectAnomalies(data.values, options?.method);
        break;

      case 'calculateTimeSeriesMetrics':
        result = processor.calculateTimeSeriesMetrics(data.timeSeries);
        break;

      case 'calculateStatistics':
        result = processor.calculateStatistics(data.values);
        break;

      default:
        throw new Error(`Unknown metrics calculation type: ${type}`);
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
