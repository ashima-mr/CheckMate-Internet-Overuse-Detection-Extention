import CircularBuffer from '../utils/circular-buffer.js';

class MetricsCollector {
  constructor() {
    // Performance monitoring
    this.performanceBuffer = new CircularBuffer(10000);
    this.memoryBuffer = new CircularBuffer(5000);
    this.cpuBuffer = new CircularBuffer(5000);
    
    // ML Metrics buffers
    this.confusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
    this.predictionHistory = new CircularBuffer(2000);
    this.votingAgreementData = new CircularBuffer(1000);
    this.adwinWindowSizes = new CircularBuffer(5000);
    
    // Model performance tracking
    this.mspcAccuracy = new CircularBuffer(1000);
    this.hatAccuracy = new CircularBuffer(1000);
    this.ensembleAccuracy = new CircularBuffer(1000);
    
    // AUC calculation data
    this.aucBuffer = new CircularBuffer(2000);
    this.shapleyBuffer = new CircularBuffer(500);
    
    // Web Workers for heavy computation
    this.shapWorker = null;
    this.aucWorker = null;
    this.metricsWorker = null;
    
    this.initializeWorkers();
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize Web Workers for heavy computations
   */
  initializeWorkers() {
    try {
      this.aucWorker = new Worker('workers/auc-worker.js');
      this.metricsWorker = new Worker('workers/metrics-worker.js');
      
      this.aucWorker.onmessage = (e) => this.handleAucResults(e.data);
      this.metricsWorker.onmessage = (e) => this.handleMetricsResults(e.data);
      
      console.log('✅ Metrics workers initialized');
    } catch (error) {
      console.warn('Workers not available, falling back to main thread:', error);
    }
  }

  clearPerformanceMarkers(operationName) {
    performance.clearMarks(`ml-${operationName}-start`);
    performance.clearMarks(`ml-${operationName}-end`);
    performance.clearMeasures(`ml-${operationName}`);
  }

  /**
   * 1. CONFUSION MATRIX & CLASSIFICATION METRICS
   */
  updateConfusionMatrix(predicted, actual, confidence = 1.0) {
    const timestamp = Date.now();
    
    // Update confusion matrix
    if (predicted === 1 && actual === 1) this.confusionMatrix.tp++;
    else if (predicted === 1 && actual === 0) this.confusionMatrix.fp++;
    else if (predicted === 0 && actual === 0) this.confusionMatrix.tn++;
    else if (predicted === 0 && actual === 1) this.confusionMatrix.fn++;
    
    // Store prediction for AUC calculation
    this.predictionHistory.push({
      predicted,
      actual,
      confidence,
      timestamp
    });
    
    // Calculate derived metrics
    const metrics = this.calculateClassificationMetrics();
    
    return {
      confusionMatrix: { ...this.confusionMatrix },
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      f1Score: metrics.f1Score,
      timestamp
    };
  }

  calculateClassificationMetrics() {
    const { tp, fp, tn, fn } = this.confusionMatrix;
    const total = tp + fp + tn + fn;
    
    if (total === 0) return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
    
    const accuracy = (tp + tn) / total;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    
    return { accuracy, precision, recall, f1Score };
  }

  /**
   * 2. PERFORMANCE MONITORING (CPU, Memory, Latency)
   */
  startPerformanceMonitoring() {
    if (!('performance' in window)) {
      console.warn('Performance API not available');
      return;
    }

    // Memory monitoring
    if (performance.measureUserAgentSpecificMemory) {
      setInterval(async () => {
        try {
          const memInfo = await performance.measureUserAgentSpecificMemory();
          this.memoryBuffer.push({
            timestamp: Date.now(),
            used: memInfo.bytes,
            breakdown: memInfo.breakdown
          });
        } catch (e) {
          console.warn('Memory measurement failed:', e);
        }
      }, 5000);
    }

    // Performance Observer for processing latency
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(entry => {
          if (entry.name.includes('ml-') || entry.name.includes('metrics-')) {
            this.performanceBuffer.push({
              name: entry.name,
              duration: entry.duration,
              timestamp: entry.startTime + performance.timeOrigin
            });
          }
        });
      });
      
      observer.observe({ entryTypes: ['measure'] });
    }

    // CPU estimation through task timing
    this.monitorCPUUsage();
  }

  monitorCPUUsage() {
    let lastTime = performance.now();
    let lastUsage = 0;
    
    const measureCPU = () => {
      const start = performance.now();
      
      // Simulate work to measure available CPU
      let iterations = 0;
      const workStart = performance.now();
      while (performance.now() - workStart < 10) {
        iterations++;
      }
      
      const actualTime = performance.now() - start;
      const expectedTime = 10;
      const cpuUsage = Math.min(100, Math.max(0, (expectedTime / actualTime) * 100));
      
      this.cpuBuffer.push({
        timestamp: Date.now(),
        usage: cpuUsage,
        iterations
      });
      
      setTimeout(measureCPU, 2000);
    };
    
    measureCPU();
  }

  recordProcessingLatency(operationName, startTime) {
    performance.mark(`ml-${operationName}-start`);

    const duration = performance.now() - startTime;
    performance.mark(`ml-${operationName}-end`);
    performance.measure(`ml-${operationName}`, `ml-${operationName}-start`, `ml-${operationName}-end`);
    
    this.clearPerformanceMarkers(operationName)

    return duration;
  }

  /**
   * 3. VOTING AGREEMENT RATE
   */
  recordVotingAgreement(mspcVote, hatVote, ensembleVote, actualClass, confidence) {
    const agreement = {
      mspcVote,
      hatVote,
      ensembleVote,
      actualClass,
      confidence,
      timestamp: Date.now(),
      mspcCorrect: mspcVote === actualClass,
      hatCorrect: hatVote === actualClass,
      ensembleCorrect: ensembleVote === actualClass,
      modelsAgree: mspcVote === hatVote,
      agreementCorrect: mspcVote === hatVote && ensembleVote === actualClass
    };
    
    this.votingAgreementData.push(agreement);
    
    return {
      agreementRate: this.calculateAgreementRate(),
      agreement
    };
  }

  calculateAgreementRate() {
    const data = this.votingAgreementData.toArray();
    if (data.length === 0) return { rate: 0, correctness: 0 };
    
    const agreements = data.filter(d => d.modelsAgree);
    const correctAgreements = agreements.filter(d => d.agreementCorrect);
    
    return {
      rate: agreements.length / data.length,
      correctness: correctAgreements.length / Math.max(1, agreements.length),
      totalSamples: data.length
    };
  }

  /**
   * 4. ADWIN WINDOW SIZE TRACKING
   */
  recordADWINWindowSize(windowSize, driftDetected = false) {
    this.adwinWindowSizes.push({
      size: windowSize,
      timestamp: Date.now(),
      driftDetected
    });
  }

  getADWINWindowDistribution() {
    const sizes = this.adwinWindowSizes.toArray().map(d => d.size);
    const histogram = this.createHistogram(sizes, 20);
    const shrinkageEvents = this.detectShrinkageEvents();
    
    return {
      histogram,
      shrinkageEvents,
      stats: {
        mean: sizes.reduce((a, b) => a + b, 0) / sizes.length || 0,
        median: this.median(sizes),
        min: Math.min(...sizes),
        max: Math.max(...sizes),
        stdDev: this.standardDeviation(sizes)
      }
    };
  }

  detectShrinkageEvents() {
    const data = this.adwinWindowSizes.toArray();
    const events = [];
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      
      if (curr.size < prev.size * 0.5) { // 50% shrinkage threshold
        events.push({
          timestamp: curr.timestamp,
          fromSize: prev.size,
          toSize: curr.size,
          shrinkageRatio: curr.size / prev.size,
          driftDetected: curr.driftDetected
        });
      }
    }
    
    return events;
  }

  /**
   * 5. MODEL ACCURACIES & AUC CALCULATIONS
   */
  updateModelAccuracies(mspcCorrect, hatCorrect, ensembleCorrect) {
    this.mspcAccuracy.push(mspcCorrect ? 1 : 0);
    this.hatAccuracy.push(hatCorrect ? 1 : 0);
    this.ensembleAccuracy.push(ensembleCorrect ? 1 : 0);
  }

  calculateAUC(predictions, labels) {
    if (this.aucWorker) {
      // Use Web Worker for AUC calculation
      try {
        this.aucWorker.postMessage({
            type: 'calculateAUC',
            predictions,
            labels,
            id: Date.now()
        });
      } catch (err) {
        console.error('AUC worker postMessage failed:', err);
        // Fallback to main-thread AUC
        return this.calculateAUCMainThread(predictions, labels);
      }
      return null; // Will be handled asynchronously
    }
    
    // Fallback: main thread calculation
    return this.calculateAUCMainThread(predictions, labels);
  }

  calculateAUCMainThread(predictions, labels) {
    if (predictions.length !== labels.length) return 0.5;
    const n = predictions.length;
    const pairs = predictions.map((pred, i) => [pred, labels[i]]);
    pairs.sort((a, b) => b[0] - a[0]); // Sort by prediction descending
    
    let tpr = [], fpr = [];
    let tp = 0, fp = 0;
    let totalPositives = labels.filter(l => l === 1).length;
    let totalNegatives = labels.length - totalPositives;
    
    if (totalPositives === 0 || totalNegatives === 0) return 0.5;
    
    for (let i = 0; i < n; i++) {
      if (pairs[i][1] === 1) tp++;
      else fp++;
      
      tpr.push(tp / totalPositives);
      fpr.push(fp / totalNegatives);
    }
    
    // Calculate AUC using trapezoidal rule
    let auc = 0;
    for (let i = 1; i < fpr.length; i++) {
      auc += (fpr[i] - fpr[i-1]) * (tpr[i] + tpr[i-1]) / 2;
    }
    
    return auc;
  }

  /**
   * UTILITY METHODS
   */
  createHistogram(data, bins = 10) {
    if (data.length === 0) return [];
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = (max - min) / bins;
    
    const histogram = Array(bins).fill(0).map((_, i) => ({
      bin: i,
      min: min + i * binSize,
      max: min + (i + 1) * binSize,
      count: 0
    }));
    
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
      histogram[binIndex].count++;
    });
    
    return histogram;
  }

  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  standardDeviation(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * WORKER MESSAGE HANDLERS
   */
  handleShapResults(data) {
    this.shapleyBuffer.push(data);
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('shapleyCalculated', { detail: data }));
  }

  handleAucResults(data) {
    this.aucBuffer.push(data);
    window.dispatchEvent(new CustomEvent('aucCalculated', { detail: data }));
  }

  handleMetricsResults(data) {
    window.dispatchEvent(new CustomEvent('metricsCalculated', { detail: data }));
  }

  /**
   * DATA EXPORT METHODS
   */
  exportAllMetrics() {
    return {
      timestamp: Date.now(),
      confusionMatrix: { ...this.confusionMatrix },
      classificationMetrics: this.calculateClassificationMetrics(),
      performanceMetrics: {
        avgLatency: this.getAverageLatency(),
        memoryStats: this.getMemoryStats(),
        cpuStats: this.getCPUStats()
      },
      votingAgreement: this.calculateAgreementRate(),
      adwinDistribution: this.getADWINWindowDistribution(),
      modelAccuracies: {
        mspc: this.getAverageAccuracy(this.mspcAccuracy),
        hat: this.getAverageAccuracy(this.hatAccuracy),
        ensemble: this.getAverageAccuracy(this.ensembleAccuracy)
      },
      shapleyValues: this.shapleyBuffer.toArray().slice(-10),
      aucScores: this.aucBuffer.toArray().slice(-10)
    };
  }

  getAverageLatency() {
    const latencies = this.performanceBuffer.toArray().map(p => p.duration);
    return latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  }

  getMemoryStats() {
    const data = this.memoryBuffer.toArray();
    if (data.length === 0) return null;
    
    const used = data.map(d => d.used);
    return {
      current: used[used.length - 1],
      average: used.reduce((a, b) => a + b, 0) / used.length,
      peak: Math.max(...used)
    };
  }

  getCPUStats() {
    const data = this.cpuBuffer.toArray();
    if (data.length === 0) return null;
    
    const usage = data.map(d => d.usage);
    return {
      current: usage[usage.length - 1],
      average: usage.reduce((a, b) => a + b, 0) / usage.length,
      peak: Math.max(...usage)
    };
  }

  getAverageAccuracy(buffer) {
    const data = buffer.toArray();
    return data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
  }
}

// Export for use in service worker and content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MetricsCollector;
}
