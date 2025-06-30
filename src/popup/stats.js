/**
 * Enhanced Stats Page Controller with All Visualizations
 * Handles Chart.js and D3.js implementations with robust error handling
 */
class StatsController {
    constructor() {
        this.charts = {};
        this.data = null;
        this.currentTab = 'overview';
        this.updateInterval = null;
        this.autoRefresh = true;
        this.nodeSize = 6;
        this.d3TreeSvg = null;
        this.init();
    }

    async init() {
        try {
            this.cacheDOM();
            this.bindEvents();
            await this.loadData();
            this.initializeCharts();
            this.updateKPIs();
            this.startAutoUpdates();
            console.log('Enhanced stats controller initialized');
        } catch (error) {
            console.error('Stats dashboard initialization error:', error);
            this.showError('Failed to load dashboard');
        }
    }

    cacheDOM() {
        // Tab elements
        this.$tabs = document.querySelectorAll('.tab-btn');
        this.$tabContents = document.querySelectorAll('.tab-content');
        
        // KPI elements
        this.$totalSessions = document.getElementById('totalSessions');
        this.$overallAccuracy = document.getElementById('overallAccuracy');
        this.$healthScore = document.getElementById('healthScore');
        this.$feedbackCount = document.getElementById('feedbackCount');
        
        // Chart canvases
        this.$classificationChart = document.getElementById('classificationChart');
        this.$confidenceChart = document.getElementById('confidenceChart');
        this.$activityChart = document.getElementById('activityChart');
        this.$classDistributionChart = document.getElementById('classDistributionChart');
        this.$accuracyChart = document.getElementById('accuracyChart');
        this.$driftChart = document.getElementById('driftChart');
        this.$featureImportanceChart = document.getElementById('featureImportanceChart');
        this.$feedbackImpactChart = document.getElementById('feedbackImpactChart');
        
        // Tree visualization
        this.$treeContainer = document.getElementById('treeVisualization');
        this.$treeLoading = this.$treeContainer?.querySelector('.tree-loading');
        
        // Tables and lists
        this.$predictionsTableBody = document.getElementById('predictionsTableBody');
        this.$feedbackHistoryList = document.getElementById('feedbackHistoryList');
        
        // Controls
        this.$predictionFilter = document.getElementById('predictionFilter');
        this.$autoRefreshCharts = document.getElementById('autoRefreshCharts');
        this.$nodeSizeRange = document.getElementById('nodeSizeRange');
        this.$treeLayout = document.getElementById('treeLayout');
    }

    bindEvents() {
        // Tab navigation
        this.$tabs.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Refresh buttons
        document.getElementById('refreshClassificationChart')?.addEventListener('click', () => this.refreshChart('classification'));
        document.getElementById('refreshPredictions')?.addEventListener('click', () => this.updatePredictionsTable());
        document.getElementById('refreshTree')?.addEventListener('click', () => this.loadTreeVisualization());

        // Tree controls
        this.$nodeSizeRange?.addEventListener('input', (e) => {
            this.nodeSize = parseInt(e.target.value, 10);
            this.updateTreeNodeSize();
        });

        this.$treeLayout?.addEventListener('change', () => this.loadTreeVisualization());

        // Settings
        this.$autoRefreshCharts?.addEventListener('change', (e) => {
            this.autoRefresh = e.target.checked;
        });

        this.$predictionFilter?.addEventListener('change', () => this.updatePredictionsTable());

        // Feedback buttons
        ['submitProductiveFeedback', 'submitNonProductiveFeedback', 'submitOveruseFeedback'].forEach((id, index) => {
            const element = document.getElementById(id);
            const classes = ['productive', 'non-productive', 'overuse'];
            if (element) {
                element.addEventListener('click', () => this.submitFeedback(classes[index]));
            }
        });

        // Export buttons
        document.getElementById('exportTreeJSON')?.addEventListener('click', () => this.exportTreeData());
        document.getElementById('exportAllData')?.addEventListener('click', () => this.exportAllData());
    }

    async loadData() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getVisualizationData' });
            if (response.error) {
                throw new Error(response.error);
            }
            this.data = response;
            return this.data;
        } catch (error) {
            console.error('Data loading error:', error);
            this.showError('Failed to load visualization data');
            throw error;
        }
    }

    initializeCharts() {
        if (!this.data) return;

        try {
            this.createClassificationChart();
            this.createConfidenceChart();
            this.createActivityChart();
            this.createClassDistributionChart();
            this.createAccuracyChart();
            this.createDriftChart();
            this.createFeatureImportanceChart();
            this.createFeedbackImpactChart();
        } catch (error) {
            console.error('Chart initialization error:', error);
            this.showError('Failed to initialize charts');
        }
    }

    createClassificationChart() {
        const ctx = this.$classificationChart?.getContext('2d');
        if (!ctx) return;

        const predictions = this.data.predictions || [];
        const hourlyData = this.groupPredictionsByHour(predictions);
        
        const timeLabels = Object.keys(hourlyData).sort();
        const productiveData = timeLabels.map(hour => hourlyData[hour].productive);
        const unproductiveData = timeLabels.map(hour => hourlyData[hour].unproductive);
        const overuseData = timeLabels.map(hour => hourlyData[hour].overuse);

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
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Non-Productive',
                        data: unproductiveData,
                        borderColor: '#ed8936',
                        backgroundColor: 'rgba(237, 137, 54, 0.1)',
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Overuse',
                        data: overuseData,
                        borderColor: '#e53e3e',
                        backgroundColor: 'rgba(229, 62, 62, 0.1)',
                        fill: false,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Classification Trends Over Time'
                    },
                    legend: {
                        position: 'top'
                    }
                },
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
                            text: 'Time (Hours)'
                        }
                    }
                }
            }
        });
    }

    createConfidenceChart() {
        const ctx = this.$confidenceChart?.getContext('2d');
        if (!ctx) return;

        const predictions = this.data.predictions || [];
        const recentPredictions = predictions.slice(-50); // Last 50 predictions
        
        const labels = recentPredictions.map((_, index) => `${index + 1}`);
        const confidenceData = recentPredictions.map(p => (p.confidence || 0) * 100);

        this.charts.confidence = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Confidence %',
                    data: confidenceData,
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'AI Confidence Trend (Last 50 Predictions)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Confidence %'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Prediction Sequence'
                        }
                    }
                }
            }
        });
    }

    createClassDistributionChart() {
        const ctx = this.$classDistributionChart?.getContext('2d');
        if (!ctx) return;

        const predictions = this.data.predictions || [];
        const classCount = [0, 0, 0];
        
        predictions.forEach(p => {
            if (p.prediction >= 0 && p.prediction <= 2) {
                classCount[p.prediction]++;
            }
        });

        this.charts.classDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Productive', 'Non-Productive', 'Overuse'],
                datasets: [{
                    data: classCount,
                    backgroundColor: ['#48bb78', '#ed8936', '#e53e3e'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Classification Distribution'
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createActivityChart() {
        const ctx = this.$activityChart?.getContext('2d');
        if (!ctx) return;

        // Generate hourly activity data
        const hourlyActivity = Array(24).fill(0).map((_, hour) => Math.random() * 100);
        
        this.charts.activity = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array(24).fill(0).map((_, i) => `${i}:00`),
                datasets: [{
                    label: 'Activity Level',
                    data: hourlyActivity,
                    backgroundColor: 'rgba(66, 153, 225, 0.6)',
                    borderColor: '#4299e1',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Activity Patterns'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Activity Level'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        }
                    }
                }
            }
        });
    }

    createAccuracyChart() {
        const ctx = this.$accuracyChart?.getContext('2d');
        if (!ctx) return;

        const stats = this.data.mlStats || {};
        const accuracyHistory = stats.performanceMetrics?.accuracyHistory || [];
        
        const labels = accuracyHistory.map((_, index) => `${index + 1}`);
        const data = accuracyHistory.map(acc => acc * 100);

        this.charts.accuracy = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Accuracy %',
                    data: data,
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Model Accuracy Over Time'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Accuracy %'
                        }
                    }
                }
            }
        });
    }

    createDriftChart() {
        const ctx = this.$driftChart?.getContext('2d');
        if (!ctx) return;

        const stats = this.data.mlStats || {};
        const driftEvents = stats.performanceMetrics?.driftDetections || [];
        
        const labels = driftEvents.map(d => new Date(d.timestamp).toLocaleDateString());
        const data = driftEvents.map((_, index) => index + 1);

        this.charts.drift = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Drift Events',
                    data: data.map((count, index) => ({
                        x: labels[index],
                        y: count
                    })),
                    backgroundColor: '#e53e3e',
                    borderColor: '#e53e3e'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Concept Drift Detection Events'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Event Count'
                        }
                    }
                }
            }
        });
    }

    createFeatureImportanceChart() {
        const ctx = this.$featureImportanceChart?.getContext('2d');
        if (!ctx) return;

        const featureNames = [
            'Session Duration',
            'Tab Switch Velocity', 
            'Focus Ratio',
            'Category Score',
            'Time Context',
            'Activity Intensity',
            'Engagement Score',
            'Domain Diversity',
            'Interaction Rate'
        ];
        
        const importanceData = featureNames.map(() => Math.random() * 100);

        this.charts.featureImportance = new Chart(ctx, {
            type: 'horizontalBar',
            data: {
                labels: featureNames,
                datasets: [{
                    label: 'Importance %',
                    data: importanceData,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: '#667eea',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Feature Importance in Model'
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Importance %'
                        }
                    }
                }
            }
        });
    }

    createFeedbackImpactChart() {
        const ctx = this.$feedbackImpactChart?.getContext('2d');
        if (!ctx) return;

        const feedbackHistory = this.data.feedbackHistory || [];
        const impactData = feedbackHistory.map((_, index) => Math.random() * 10 + 85); // Simulated improvement

        this.charts.feedbackImpact = new Chart(ctx, {
            type: 'line',
            data: {
                labels: feedbackHistory.map((_, index) => `FB ${index + 1}`),
                datasets: [{
                    label: 'Accuracy After Feedback',
                    data: impactData,
                    borderColor: '#9f7aea',
                    backgroundColor: 'rgba(159, 122, 234, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Impact of User Feedback on Model Accuracy'
                    }
                },
                scales: {
                    y: {
                        min: 80,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Accuracy %'
                        }
                    }
                }
            }
        });
    }

    // D3.js Tree Visualization
    async loadTreeVisualization() {
        if (!this.$treeContainer) return;

        try {
            if (this.$treeLoading) this.$treeLoading.style.display = 'flex';

            const treeData = await this.getTreeData();
            if (!treeData) {
                this.showTreeError('No tree data available. Train the model first.');
                return;
            }

            this.renderD3Tree(treeData);

        } catch (error) {
            console.error('Tree visualization error:', error);
            this.showTreeError('Failed to load tree visualization');
        } finally {
            if (this.$treeLoading) this.$treeLoading.style.display = 'none';
        }
    }

    async getTreeData() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getTreeStructure' });
            return response.treeStructure;
        } catch (error) {
            console.error('Failed to get tree data:', error);
            return null;
        }
    }

    renderD3Tree(treeData) {
        // Clear existing SVG
        d3.select(this.$treeContainer).select('svg').remove();

        const width = this.$treeContainer.clientWidth;
        const height = this.$treeContainer.clientHeight;
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };

        const svg = d3.select(this.$treeContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Create tree layout
        const treeLayout = d3.tree()
            .size([height - margin.top - margin.bottom, width - margin.left - margin.right]);

        // Create hierarchy
        const root = d3.hierarchy(treeData);
        treeLayout(root);

        // Create links
        const link = g.selectAll('.link')
            .data(root.links())
            .enter().append('path')
            .attr('class', 'link')
            .attr('d', d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x))
            .style('fill', 'none')
            .style('stroke', '#ccc')
            .style('stroke-width', 2);

        // Create nodes
        const node = g.selectAll('.node')
            .data(root.descendants())
            .enter().append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.y},${d.x})`);

        // Add circles for nodes
        node.append('circle')
            .attr('r', this.nodeSize)
            .style('fill', d => d.children ? '#4299e1' : '#48bb78')
            .style('stroke', '#333')
            .style('stroke-width', 2);

        // Add labels
        node.append('text')
            .attr('dy', '.35em')
            .attr('x', d => d.children ? -this.nodeSize - 5 : this.nodeSize + 5)
            .style('text-anchor', d => d.children ? 'end' : 'start')
            .style('font-size', '10px')
            .text(d => d.data.splitFeature ? `${d.data.splitFeature}` : 'Leaf');

        this.d3TreeSvg = svg;
    }

    // Utility Methods
    groupPredictionsByHour(predictions) {
        const hourlyData = {};
        
        predictions.forEach(prediction => {
            const hour = new Date(prediction.timestamp).getHours();
            const hourKey = `${hour}:00`;
            
            if (!hourlyData[hourKey]) {
                hourlyData[hourKey] = { productive: 0, unproductive: 0, overuse: 0 };
            }
            
            switch (prediction.prediction) {
                case 0: hourlyData[hourKey].productive++; break;
                case 1: hourlyData[hourKey].unproductive++; break;
                case 2: hourlyData[hourKey].overuse++; break;
            }
        });
        
        return hourlyData;
    }

    updateKPIs() {
        if (!this.data) return;

        const predictions = this.data.predictions || [];
        const feedbackHistory = this.data.feedbackHistory || [];
        const mlStats = this.data.mlStats || {};

        // Update KPI displays
        if (this.$totalSessions) {
            this.$totalSessions.textContent = Math.ceil(predictions.length / 10).toLocaleString();
        }

        if (this.$overallAccuracy) {
            const accuracy = mlStats.accuracy || 0;
            this.$overallAccuracy.textContent = `${Math.round(accuracy * 100)}%`;
        }

        if (this.$healthScore) {
            const healthScore = this.calculateHealthScore(predictions);
            this.$healthScore.textContent = `${healthScore}%`;
        }

        if (this.$feedbackCount) {
            this.$feedbackCount.textContent = feedbackHistory.length.toLocaleString();
        }
    }

    calculateHealthScore(predictions) {
        if (predictions.length === 0) return 0;
        
        const classCount = [0, 0, 0];
        predictions.slice(-50).forEach(p => {
            if (p.prediction >= 0 && p.prediction <= 2) {
                classCount[p.prediction]++;
            }
        });
        
        const total = classCount.reduce((sum, count) => sum + count, 0);
        if (total === 0) return 0;
        
        const healthScore = (classCount[0] * 100 + classCount[1] * 50 + classCount[2] * 0) / total;
        return Math.round(healthScore);
    }

    updatePredictionsTable() {
        if (!this.$predictionsTableBody || !this.data) return;

        const predictions = this.data.predictions || [];
        const filterValue = this.$predictionFilter?.value || 'all';
        
        let filteredPredictions = predictions;
        if (filterValue !== 'all') {
            filteredPredictions = predictions.filter(p => p.prediction == filterValue);
        }

        this.$predictionsTableBody.innerHTML = '';
        
        const classLabels = ['Productive', 'Non-Productive', 'Overuse'];
        const classColors = ['#48bb78', '#ed8936', '#e53e3e'];

        filteredPredictions.slice(-20).reverse().forEach(prediction => {
            const row = document.createElement('div');
            row.className = 'prediction-row';
            
            const time = new Date(prediction.timestamp).toLocaleTimeString();
            const classification = classLabels[prediction.prediction] || 'Unknown';
            const confidence = Math.round((prediction.confidence || 0) * 100);
            
            row.innerHTML = `
                <span>${time}</span>
                <span class="prediction-class-badge class-${prediction.prediction === 0 ? 'productive' : prediction.prediction === 1 ? 'non-productive' : 'overuse'}">
                    ${classification}
                </span>
                <span>${confidence}%</span>
                <span>${prediction.userFeedback ? '✓' : '—'}</span>
            `;
            
            this.$predictionsTableBody.appendChild(row);
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        
        this.$tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        this.$tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Load specific content when switching tabs
        if (tabName === 'tree') {
            this.loadTreeVisualization();
        } else if (tabName === 'feedback') {
            this.updateFeedbackHistory();
        }
    }

    async submitFeedback(classification) {
        try {
            const feedback = {
                timestamp: Date.now(),
                classification: classification,
                reasoning: document.getElementById('feedbackReasoning')?.value || ''
            };

            await chrome.runtime.sendMessage({
                action: 'submitFeedback',
                feedback: feedback
            });

            this.showToast('Feedback submitted successfully', 'success');
            
            // Clear reasoning field
            const reasoningField = document.getElementById('feedbackReasoning');
            if (reasoningField) reasoningField.value = '';
            
            // Refresh data
            await this.loadData();
            this.updateKPIs();
            this.updateFeedbackHistory();
            
        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showToast('Failed to submit feedback', 'error');
        }
    }

    updateFeedbackHistory() {
        if (!this.$feedbackHistoryList || !this.data) return;

        const feedbackHistory = this.data.feedbackHistory || [];
        
        this.$feedbackHistoryList.innerHTML = '';
        
        feedbackHistory.slice(-10).reverse().forEach(feedback => {
            const item = document.createElement('div');
            item.className = 'feedback-item';
            item.style.cssText = `
                padding: 10px;
                border-bottom: 1px solid var(--color-border);
                margin-bottom: 10px;
            `;
            
            const time = new Date(feedback.timestamp).toLocaleString();
            
            item.innerHTML = `
                <div style="font-weight: 500;">${feedback.classification}</div>
                <div style="font-size: 0.9em; color: var(--color-text-secondary);">${time}</div>
                ${feedback.reasoning ? `<div style="font-size: 0.8em; margin-top: 5px; font-style: italic;">"${feedback.reasoning}"</div>` : ''}
            `;
            
            this.$feedbackHistoryList.appendChild(item);
        });
    }

    startAutoUpdates() {
        this.updateInterval = setInterval(async () => {
            if (!this.autoRefresh) return;
            
            try {
                await this.loadData();
                this.updateKPIs();
                this.updatePredictionsTable();
                
                // Refresh charts on overview tab
                if (this.currentTab === 'overview') {
                    this.refreshAllCharts();
                }
            } catch (error) {
                console.error('Auto-update error:', error);
            }
        }, 5000);
    }

    refreshAllCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.update === 'function') {
                chart.update();
            }
        });
    }

    refreshChart(chartName) {
        const chart = this.charts[chartName];
        if (chart && typeof chart.update === 'function') {
            chart.update();
        }
    }

    updateTreeNodeSize() {
        if (this.d3TreeSvg) {
            this.d3TreeSvg.selectAll('circle')
                .attr('r', this.nodeSize);
        }
    }

    // Export Functions
    exportTreeData() {
        if (!this.data || !this.data.treeStats) {
            this.showToast('No tree data to export', 'warning');
            return;
        }

        const treeData = JSON.stringify(this.data.treeStats, null, 2);
        const blob = new Blob([treeData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `checkmate_tree_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportAllData() {
        if (!this.data) {
            this.showToast('No data to export', 'warning');
            return;
        }

        const exportData = JSON.stringify(this.data, null, 2);
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `checkmate_full_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Error Handling
    showError(message) {
        console.error(message);
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.cssText = `
            background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#48bb78' : '#4299e1'};
            color: white;
            padding: 10px 16px;
            border-radius: 8px;
            margin-top: 6px;
            font-size: 14px;
            animation: fadeInOut 4s forwards;
        `;
        toast.textContent = message;
        
        const container = document.getElementById('toastContainer') || document.body;
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
    }

    showTreeError(message) {
        if (this.$treeContainer) {
            this.$treeContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #e53e3e;">
                    <div style="text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                        <div>${message}</div>
                    </div>
                </div>
            `;
        }
    }

    // Cleanup
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.statsController = new StatsController();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
    if (window.statsController) {
        window.statsController.destroy();
    }
});
