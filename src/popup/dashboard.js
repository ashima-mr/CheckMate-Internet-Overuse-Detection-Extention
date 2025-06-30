// dashboard.js - DashboardInterface Implementation

class DashboardInterface {
    constructor() {
        /** CONFIGURATION **/
        this.updateInterval = 2000; // ms
        this.autoRefresh = true;
        this.nodeSize = 6;
        this.currentTab = 'overview';
        /** STATE **/
        this.charts = {};

        /** INIT **/
        this.cacheDOM();
        this.bindEvents();
        this.initCharts();
        this.refreshAll();
        this.startAutoUpdates();
    }

    /** DOM CACHE **/
    cacheDOM() {
        this.$container = document.getElementById('dashboard-container');
        this.$tabs = document.querySelectorAll('.tab-btn');
        this.$tabContents = document.querySelectorAll('.tab-content');
        // Overview metrics
        this.$instances = document.getElementById('instances-count');
        this.$accuracy = document.getElementById('accuracy-value');
        this.$depth = document.getElementById('tree-depth');
        this.$drift = document.getElementById('drift-count');
        this.$performanceChart = document.getElementById('performance-chart');
        this.$classDistChart = document.getElementById('class-distribution-chart');
        this.$predictionsList = document.getElementById('predictions-list');
        // Tree
        this.$treeContainer = document.getElementById('tree-visualization');
        this.$treeLoading = this.$treeContainer?.querySelector('.tree-loading');
        // Settings
        this.$sensitivity = document.getElementById('sensitivity');
        this.$sensitivityValue = document.getElementById('sensitivity-value');
        this.$autoRefresh = document.getElementById('auto-refresh');
        this.$nodeSizeRange = document.getElementById('node-size');
        // Toast
        this.$toast = document.getElementById('notification-toast');
    }

    /** EVENT BINDING **/
    bindEvents() {
        // Tab buttons
        this.$tabs.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        // Refresh buttons
        document.getElementById('refresh-tree')?.addEventListener('click', () => this.loadTree());
        document.getElementById('refresh-predictions')?.addEventListener('click', () => this.loadOverview());
        // Controls
        this.$sensitivity?.addEventListener('input', e => {
            this.$sensitivityValue.textContent = parseFloat(e.target.value).toFixed(2);
        });
        this.$sensitivity?.addEventListener('change', e => {
            const value = parseFloat(e.target.value);
            this.updateSetting('sensitivity', value);
        });
        this.$autoRefresh?.addEventListener('change', e => {
            this.autoRefresh = e.target.checked;
        });
        this.$nodeSizeRange?.addEventListener('input', e => {
            this.nodeSize = parseInt(e.target.value, 10);
            this.updateTreeNodeSize();
        });
        // Feedback buttons
        document.querySelectorAll('.feedback-btn').forEach(btn => {
            btn.addEventListener('click', () => this.submitFeedback(btn.dataset.class));
        });
        document.getElementById('submit-feedback')?.addEventListener('click', () => this.submitFeedback());
        // FAB emergency
        document.getElementById('emergency-stop')?.addEventListener('click', () => this.emergencyStop());
    }

    /** CHART INIT **/
    initCharts() {
        this.charts.performance = this.createLineChart('#performance-chart', {
            width: 600,
            height: 180
        });
        this.charts.classDistribution = this.createPieChart('#class-distribution-chart', {});
    }

    /** SWITCH TAB **/
    switchTab(tabName) {
        this.currentTab = tabName;
        this.$tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
        this.$tabContents.forEach(content => content.classList.toggle('active', content.id === `${tabName}-tab`));
        // Load specific data when switching
        if (tabName === 'tree') this.loadTree();
        if (tabName === 'performance') this.loadPerformance();
    }

    /** AUTO UPDATES **/
    startAutoUpdates() {
        setInterval(() => {
            if (!this.autoRefresh) return;
            this.refreshAll();
        }, this.updateInterval);
    }

    /** REFRESH ALL **/
    refreshAll() {
        switch (this.currentTab) {
            case 'overview':
                this.loadOverview();
                break;
            case 'tree':
                this.loadTree();
                break;
            case 'performance':
                this.loadPerformance();
                break;
            default:
                this.loadOverview();
        }
    }

    /** OVERVIEW DATA **/
    async loadOverview() {
        const stats = await this.sendMessage('getStats');
        if (!stats || stats.error) {
            this.toast('Failed to load stats', true);
            return;
        }
        const ml = stats.mlStats || {};
        this.$instances.textContent = ml.instancesSeen?.toLocaleString() ?? '--';
        this.$accuracy.textContent = `${Math.round((ml.accuracy ?? 0) * 100)}%`;
        this.$depth.textContent = ml.treeDepth ?? '--';
        this.$drift.textContent = ml.driftCount ?? '--';

        // Update class distribution chart
        if (ml.classDistribution) {
            this.updatePieChart(this.charts.classDistribution, [
                { label: 'Productive', value: ml.classDistribution[0] || 0, color: '#48bb78' },
                { label: 'Non-Productive', value: ml.classDistribution[1] || 0, color: '#f6ad55' },
                { label: 'Overuse', value: ml.classDistribution[2] || 0, color: '#e53e3e' }
            ]);
        }
        // Performance
        if (ml.performanceMetrics) {
            this.updateLineChart(this.charts.performance, ml.performanceMetrics);
        }
        // Predictions
        if (stats.recentPredictions) {
            this.renderPredictions(stats.recentPredictions);
        }
    }

    /** TREE DATA **/
    async loadTree() {
        if (this.$treeLoading) this.$treeLoading.style.display = 'flex';
        const data = await this.sendMessage('getVisualizationData');
        if (!data || data.error || !data.treeStats) {
            this.toast('Tree data unavailable', true);
            if (this.$treeLoading) this.$treeLoading.style.display = 'none';
            return;
        }
        const history = data.treeStats.treeStructureHistory || [];
        if (history.length === 0) {
            this.toast('Train the model to see the tree', false);
            if (this.$treeLoading) this.$treeLoading.style.display = 'none';
            return;
        }
        const latest = history[history.length - 1].structure;
        this.renderTree(latest);
        if (this.$treeLoading) this.$treeLoading.style.display = 'none';
    }

    /** PERFORMANCE DATA **/
    async loadPerformance() {
        const data = await this.sendMessage('getVisualizationData');
        if (!data || data.error) {
            this.toast('Failed to load performance data', true);
            return;
        }
        // TODO: Implement specific performance chart updates
    }

    /** RENDER PREDICTIONS **/
    renderPredictions(predictions) {
        this.$predictionsList.innerHTML = '';
        predictions.slice(-20).reverse().forEach(p => {
            const item = document.createElement('div');
            item.className = 'prediction-item';
            item.innerHTML = `
                <div class="prediction-label ${p.classLabel}">${p.classLabel}</div>
                <div class="prediction-time">${new Date(p.timestamp).toLocaleTimeString()}</div>
                <div class="prediction-confidence">${Math.round(p.confidence * 100)}%</div>`;
            this.$predictionsList.appendChild(item);
        });
    }

    /** TREE RENDER **/
    renderTree(structure) {
        // Clear
        this.$treeContainer.innerHTML = '';
        const svg = d3.select(this.$treeContainer)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%');
        const g = svg.append('g');
        const root = d3.hierarchy(structure);
        const treeLayout = d3.tree().size([400, 760]);
        treeLayout(root);
        // Links
        g.selectAll('path.link')
            .data(root.links())
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('d', d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x))
            .attr('stroke', '#ccc')
            .attr('fill', 'none');
        // Nodes
        const nodes = g.selectAll('g.node')
            .data(root.descendants())
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.y},${d.x})`);
        nodes.append('circle')
            .attr('r', this.nodeSize)
            .attr('fill', d => d.data.isLeaf ? '#48bb78' : '#667eea')
            .attr('stroke', '#495057');
        nodes.append('text')
            .attr('dy', 3)
            .attr('x', d => d.children ? -12 : 12)
            .attr('text-anchor', d => d.children ? 'end' : 'start')
            .style('font-size', '10px')
            .text(d => d.data.isLeaf ? `(${d.data.instanceCount})` : `F${d.data.splitFeature}`);
    }

    /** CHART HELPERS **/
    createLineChart(selector, { width = 500, height = 150 }) {
        const svg = d3.select(selector).append('svg').attr('width', width).attr('height', height);
        const margin = { top: 10, right: 20, bottom: 25, left: 40 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const xScale = d3.scaleTime().range([0, innerW]);
        const yScale = d3.scaleLinear().range([innerH, 0]);
        const line = d3.line()
            .x(d => xScale(d.time))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);
        g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerH})`);
        g.append('g').attr('class', 'y-axis');
        const path = g.append('path').attr('class', 'line').attr('fill', 'none').attr('stroke', '#667eea').attr('stroke-width', 2);
        return { svg, g, xScale, yScale, line, path, innerH };
    }

    updateLineChart(chart, metrics) {
        if (!metrics.timestamps || metrics.timestamps.length === 0) return;
        const data = metrics.accuracyHistory.map((v, i) => ({ value: v, time: new Date(metrics.timestamps[i]) }));
        chart.xScale.domain(d3.extent(data, d => d.time));
        chart.yScale.domain([0, 1]);
        chart.g.select('.x-axis').call(d3.axisBottom(chart.xScale).ticks(5).tickFormat(d3.timeFormat('%H:%M')));
        chart.g.select('.y-axis').call(d3.axisLeft(chart.yScale).ticks(4).tickFormat(d3.format('.0%')));
        chart.path.datum(data).attr('d', chart.line);
    }

    createPieChart(selector, opts) {
        const width = 180;
        const height = 180;
        const radius = Math.min(width, height) / 2 - 10;
        const svg = d3.select(selector).append('svg').attr('width', width).attr('height', height);
        const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
        const pie = d3.pie().value(d => d.value).sort(null);
        const arc = d3.arc().innerRadius(0).outerRadius(radius);
        return { svg, g, pie, arc, radius };
    }

    updatePieChart(chart, data) {
        const arcs = chart.g.selectAll('path').data(chart.pie(data));
        arcs.enter().append('path').merge(arcs)
            .attr('d', chart.arc)
            .attr('fill', d => d.data.color);
        arcs.exit().remove();
    }

    updateTreeNodeSize() {
        // simple approach: re-render tree with new node size
        if (this.currentTab === 'tree') this.loadTree();
    }

    /** FEEDBACK **/
    async submitFeedback(label = null) {
        const reason = document.getElementById('feedback-reason')?.value || '';
        const payload = {
            timestamp: Date.now(),
            trueClass: label,
            confidence: 1.0,
            reasoning: reason
        };
        const resp = await this.sendMessage('submitFeedback', { feedback: payload });
        if (resp && resp.success) this.toast('Feedback sent!');
        else this.toast('Feedback failed', true);
    }

    /** SETTINGS **/
    async updateSetting(key, value) {
        await this.sendMessage('updateSettings', { settings: { [key]: value } });
        this.toast('Setting updated');
    }

    /** EMERGENCY STOP **/
    async emergencyStop() {
        await this.sendMessage('pauseTracking');
        this.toast('Tracking paused');
    }

    /** TOAST **/
    toast(msg, error = false) {
        const div = document.createElement('div');
        div.className = 'toast';
        if (error) div.style.background = 'var(--danger)';
        div.textContent = msg;
        this.$toast.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    }

    /** UTIL: sendMessage to background **/
    sendMessage(action, payload = {}) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action, ...payload }, response => {
                resolve(response);
            });
        });
    }
}

window.DashboardInterface = DashboardInterface;
document.addEventListener('DOMContentLoaded', () => new DashboardInterface());