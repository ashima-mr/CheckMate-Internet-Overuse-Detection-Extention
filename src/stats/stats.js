// stats.js
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ action: 'getVisualizationData' }, (data) => {
    if (data.error) {
      document.body.innerHTML = '<p>Error loading stats: ' + data.error + '</p>';
      return;
    }

    // 1. Populate the predictions table
    const tbody = document.getElementById('predictionsTableBody');
    data.predictions.slice(-20).reverse().forEach(pred => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(pred.timestamp).toLocaleTimeString()}</td>
        <td>${pred.prediction === 1 ? 'Yes' : 'No'}</td>
        <td>${Math.round(pred.confidence * 100)}%</td>
      `;
      tbody.appendChild(tr);
    });

    // 2. Build confidence time-series chart
    const ctx = document.getElementById('confidenceChart').getContext('2d');
    const labels = data.predictions.map(p => new Date(p.timestamp).toLocaleTimeString());
    const confidences = data.predictions.map(p => p.confidence * 100);

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Confidence (%)',
          data: confidences,
          borderColor: '#3182ce',
          backgroundColor: 'rgba(49,130,206,0.2)',
          fill: true,
          tension: 0.2,
          pointRadius: 2
        }]
      },
      options: {
        scales: {
          x: { display: true, title: { display: true, text: 'Time' } },
          y: { beginAtZero: true, max: 100, title: { display: true, text: 'Confidence (%)' } }
        }
      }
    });
  });
});
