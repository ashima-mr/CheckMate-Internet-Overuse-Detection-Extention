class DashboardController {
  constructor() {
    this.charts = {};
    this.data = null;
    this.timeRange = '24h';
    this.init();
  }

  async init() {
    try {
      await this.loadData();
      this.setupEventListeners();
      this.initializeCharts();
      this.updateKPIs();
      this.updateTables();
      this.startAutoRefresh();
    } catch (error) {
      console.error('Dashboard initialization error:', error);
      this.showError('Failed to load dashboard data');
    }
  }

  async loadData() {
    const response = await chrome.runtime.sendMessage({ action: 'getVisualizationData' });
    if (response.error) {
      throw new Error(response.error);
    }
    this.data = response;
  }

  initializeCharts() {
    this.createClassificationChart();
    this.createConfidenceChart();
    this.createActivityChart();
    this.createCategoryChart();
  }

  createClassificationChart() {
    const ctx = document.getElementById('classificationChart').getContext('2d');
    
    // Process prediction data for time series
    const predictions = this.data.predictions || [];
    const timeLabels = [];
    const productiveData = [];
    const unproductiveData = [];
    const unhealthyData = [];
    
    // Group predictions by hour
    const hourlyData = this.groupPredictionsByHour(predictions);
    
    Object.entries(hourlyData).forEach(([hour, data]) => {
      timeLabels.push(hour);
      productiveData.push(data.productive);
      unproductiveData.push(data.unproductive);
      unhealthyData.push(data.unhealthy);
    });

    this.charts.classification = new Chart(ctx, {
      type: 'line',
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: 'Productive',
            data: productiveData,
            borderColor: '#48bb78',
            backgroundColor: 'rgba(72, 187, 120, 0.1)',
            fill: true
          },
          {
            label: 'Unproductive',
            data: unproductiveData,
            borderColor: '#ed8936',
            backgroundColor: 'rgba(237, 137, 54, 0.1)',
            fill: true
          },
          {
            label: 'Unhealthy',
            data: unhealthyData,
            borderColor: '#e53e3e',
            backgroundColor: 'rgba(229, 62, 62, 0.1)',
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Classifications'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
            }
          }
        },
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        }
      }
    });
  }

  createConfidenceChart() {
    const ctx = document.getElementById('confidenceChart').getContext('2d');
    
    const predictions = this.data.predictions || [];
    const confidenceData = predictions.map(p => ({
      x: new Date(p.timestamp),
      y: (p.confidence || 0) * 100
    }));

    this.charts.confidence = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Confidence %',
          data: confidenceData,
          backgroundColor: 'rgba(66, 153, 225, 0.6)',
          borderColor: '#4299e1',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                hour: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Confidence %'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  updateKPIs() {
    const predictions = this.data.predictions || [];
    const feedbackHistory = this.data.feedbackHistory || [];
    
    // Total sessions (approximate from predictions)
    const sessions = Math.ceil(predictions.length / 10);
    document.getElementById('totalSessions').textContent = sessions;
    
    // Total predictions
    document.getElementById('totalPredictions').textContent = predictions.length;
    
    // Health score calculation
    const healthScore = this.calculateHealthScore(predictions);
    document.getElementById('overallHealthScore').textContent = healthScore + '%';
    
    // Average confidence
    const avgConfidence = predictions.length > 0 
      ? Math.round(predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / predictions.length * 100)
      : 0;
    document.getElementById('avgConfidence').textContent = avgConfidence + '%';
    
    // Feedback count
    document.getElementById('feedbackCount').textContent = feedbackHistory.length;
  }

  updateTables() {
    this.updatePredictionsTable();
    this.updateFeedbackTable();
  }

  updatePredictionsTable() {
    const tbody = document.getElementById('predictionsTableBody');
    const predictions = this.data.predictions || [];
    
    tbody.innerHTML = '';
    
    predictions.slice(-20).reverse().forEach(pred => {
      const row = document.createElement('tr');
      
      const classLabels = ['Productive', 'Unproductive', 'Unhealthy'];
      const classColors = ['#48bb78', '#ed8936', '#e53e3e'];
      const classification = classLabels[pred.prediction] || 'Unknown';
      const confidence = Math.round((pred.confidence || 0) * 100);
      const patternScore = Math.round((pred.prediction / 2) * 100);
      
      row.innerHTML = `
        <td>${new Date(pred.timestamp).toLocaleTimeString()}</td>
        <td><span class="class-badge" style="background-color: ${classColors[pred.prediction]}">${classification}</span></td>
        <td>${confidence}%</td>
        <td>${patternScore}%</td>
        <td>${pred.userFeedback ? '✓' : '-'}</td>
      `;
      
      tbody.appendChild(row);
    });
  }

  calculateHealthScore(predictions) {
    if (predictions.length === 0) return 0;
    
    const classCount = [0, 0, 0];
    predictions.forEach(pred => {
      if (pred.prediction >= 0 && pred.prediction <= 2) {
        classCount[pred.prediction]++;
      }
    });
    
    const total = classCount.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;
    
    // Weighted health score: Productive=100%, Unproductive=50%, Unhealthy=0%
    const score = (classCount[0] * 100 + classCount[1] * 50 + classCount[2] * 0) / total;
    return Math.round(score);
  }

  groupPredictionsByHour(predictions) {
    const grouped = {};
    
    predictions.forEach(pred => {
      const hour = new Date(pred.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      
      if (!grouped[hour]) {
        grouped[hour] = { productive: 0, unproductive: 0, unhealthy: 0 };
      }
      
      switch (pred.prediction) {
        case 0: grouped[hour].productive++; break;
        case 1: grouped[hour].unproductive++; break;
        case 2: grouped[hour].unhealthy++; break;
      }
    });
    
    return grouped;
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new DashboardController();
});
