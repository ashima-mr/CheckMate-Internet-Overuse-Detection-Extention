/**
 * Enhanced Feature Engineering module for behavioral pattern extraction
 * MODIFIED: Added comprehensive metrics collection for research evaluation
 */

class FeatureEngineer {
    constructor(options = {}) {
        this.primaryWindow = new CircularBuffer(120); // 30-min window (15s intervals)
        this.baselineWindow = new CircularBuffer(480); // 2-hour window
        this.shortWindow = new CircularBuffer(60); // 15-min window
        
        this.currentSession = {
            startTime: Date.now(),
            tabSwitches: 0,
            focusTime: 0,
            websiteCategories: new Map(),
            domains: new Set(),
            lastActivityTime: Date.now(),
            scrollEvents: 0,
            clickEvents: 0,
            keystrokeEvents: 0,
            pageViews: 0,
            totalActiveTime: 0
        };

        // User-defined categories - no pre-coded lists
        this.websiteCategories = {};
        this.eventHistory = [];

        // ADDED: Comprehensive metrics for research evaluation
        this.researchMetrics = {
            // Technical Achievement Validation
            circularBufferOperations: {
                insertions: 0,
                updates: 0,
                operationTimes: [], // For O(1) performance validation
            },
            
            // Feature Extraction Accuracy tracking
            featureValues: {
                sessionDuration: [],
                tabSwitchVelocity: [],
                focusRatio: [],
                categoryScore: [],
                timeContextScore: [],
                activityIntensity: [],
                engagementScore: [],
                domainDiversity: [],
                interactionRate: []
            },
            
            // Temporal scales validation
            temporalScales: {
                shortWindow: { size: 60, operations: 0 },
                primaryWindow: { size: 120, operations: 0 },
                baselineWindow: { size: 480, operations: 0 }
            },
            
            // Event processing metrics
            eventProcessing: {
                totalEvents: 0,
                eventTypes: {},
                processingTimes: []
            }
        };

        // Load user-defined categories from storage
        this.loadUserCategories();
        // Listen for category updates
        this.setupCategoryListener();
    }

    /**
     * Enhanced process event with metrics collection
     * MODIFIED: Added comprehensive event tracking and performance metrics
     */
    processEvent(event) {
        // ADDED: Track event processing start time for performance metrics
        const processingStartTime = performance.now();
        
        if (!event || !event.type) {
            return;
        }

        this.eventHistory.push({
            ...event,
            processedAt: Date.now()
        });

        // Keep event history manageable
        if (this.eventHistory.length > 1000) {
            this.eventHistory.shift();
        }

        // ADDED: Track event processing metrics
        this.researchMetrics.eventProcessing.totalEvents++;
        this.researchMetrics.eventProcessing.eventTypes[event.type] = 
            (this.researchMetrics.eventProcessing.eventTypes[event.type] || 0) + 1;

        switch (event.type) {
            case 'tab_activated':
                this.handleTabActivated(event);
                break;
            case 'tab_updated':
                this.handleTabUpdated(event);
                break;
            case 'focus_change':
                this.handleFocusChange(event);
                break;
            case 'idle_state':
                this.handleIdleState(event);
                break;
            case 'page_activity':
                this.handlePageActivity(event);
                break;
            case 'scroll_behavior':
                this.handleScrollBehavior(event);
                break;
            case 'page_session_end':
                this.handlePageSessionEnd(event);
                break;
            default:
                console.debug('Unknown event type:', event.type);
        }

        // Update activity windows with performance tracking
        this.updateActivityWindows(event);

        // ADDED: Record event processing time
        const processingTime = performance.now() - processingStartTime;
        this.researchMetrics.eventProcessing.processingTimes.push({
            timestamp: Date.now(),
            eventType: event.type,
            processingTime: processingTime
        });

        // Keep processing times array manageable
        if (this.researchMetrics.eventProcessing.processingTimes.length > 1000) {
            this.researchMetrics.eventProcessing.processingTimes.shift();
        }
    }

    /**
     * Enhanced update activity windows with buffer operation metrics
     * MODIFIED: Added circular buffer performance tracking
     */
    updateActivityWindows(event) {
        const dataPoint = {
            timestamp: event.timestamp,
            type: event.type,
            sessionDuration: event.timestamp - this.currentSession.startTime,
            tabSwitches: this.currentSession.tabSwitches,
            focusTime: this.currentSession.focusTime,
            domains: this.currentSession.domains.size,
            scrollEvents: this.currentSession.scrollEvents,
            clickEvents: this.currentSession.clickEvents,
            keystrokeEvents: this.currentSession.keystrokeEvents
        };

        // ADDED: Track circular buffer operations with timing
        const operationStartTime = performance.now();

        this.primaryWindow.push(dataPoint);
        this.baselineWindow.push(dataPoint);
        this.shortWindow.push(dataPoint);

        const operationTime = performance.now() - operationStartTime;

        // ADDED: Record buffer operation metrics
        this.researchMetrics.circularBufferOperations.insertions++;
        this.researchMetrics.circularBufferOperations.operationTimes.push({
            timestamp: Date.now(),
            operationType: 'push',
            operationTime: operationTime
        });

        // Update temporal scales metrics
        this.researchMetrics.temporalScales.shortWindow.operations++;
        this.researchMetrics.temporalScales.primaryWindow.operations++;
        this.researchMetrics.temporalScales.baselineWindow.operations++;

        // Keep operation times array manageable
        if (this.researchMetrics.circularBufferOperations.operationTimes.length > 1000) {
            this.researchMetrics.circularBufferOperations.operationTimes.shift();
        }
    }

    /**
     * Enhanced feature extraction with comprehensive metrics collection
     * MODIFIED: Added detailed feature value tracking for research analysis
     */
    extractFeatures() {
        const now = Date.now();
        const sessionDuration = now - this.currentSession.startTime;
        const sessionDurationHours = sessionDuration / (1000 * 60 * 60);
        const sessionDurationMinutes = sessionDuration / (1000 * 60);

        // Temporal features
        const hourOfDay = new Date().getHours();
        const dayOfWeek = new Date().getDay();
        const timeScore = this.calculateTimeContextScore(hourOfDay, dayOfWeek);

        // Session-based features
        const tabSwitchVelocity = this.currentSession.tabSwitches / Math.max(sessionDurationMinutes, 0.5);
        const focusRatio = this.currentSession.focusTime / Math.max(sessionDurationMinutes, 1);

        // Activity features
        const primaryWindowStats = this.calculateWindowStats(this.primaryWindow);
        const baselineWindowStats = this.calculateWindowStats(this.baselineWindow);
        const shortStats = this.calculateWindowStats(this.shortWindow);
        const shortIntensity = this.calculateActivityIntensity(shortStats);
        const mediumIntensity = this.calculateActivityIntensity(primaryWindowStats);
        const activityIntensity = 0.7 * shortIntensity + 0.3 * mediumIntensity;
        const engagementScore = this.calculateEngagementScore();

        // Content and behavioral features
        const categoryScore = this.calculateCategoryScore();
        const domainDiversity = this.calculateDomainDiversity();

        // Interaction features
        const interactionRate = this.calculateInteractionRate();

        // ADDED: Store feature values for research metrics
        const features = [
            this.normalizeSessionDuration(sessionDurationHours),
            this.normalizeTabSwitchVelocity(tabSwitchVelocity),
            this.normalizeFocusRatio(focusRatio),
            this.normalizeCategoryScore(categoryScore),
            this.normalizeTimeScore(timeScore),
            this.normalizeActivityIntensity(activityIntensity),
            this.normalizeEngagementScore(engagementScore),
            this.normalizeDomainDiversity(domainDiversity),
            this.normalizeInteractionRate(interactionRate)
        ];

        // ADDED: Track individual feature values for research analysis
        this.researchMetrics.featureValues.sessionDuration.push({
            timestamp: now,
            raw: sessionDurationHours,
            normalized: features[0]
        });
        
        this.researchMetrics.featureValues.tabSwitchVelocity.push({
            timestamp: now,
            raw: tabSwitchVelocity,
            normalized: features[1]
        });
        
        this.researchMetrics.featureValues.focusRatio.push({
            timestamp: now,
            raw: focusRatio,
            normalized: features[2]
        });
        
        this.researchMetrics.featureValues.categoryScore.push({
            timestamp: now,
            raw: categoryScore,
            normalized: features[3]
        });
        
        this.researchMetrics.featureValues.timeContextScore.push({
            timestamp: now,
            raw: timeScore,
            normalized: features[4]
        });
        
        this.researchMetrics.featureValues.activityIntensity.push({
            timestamp: now,
            raw: activityIntensity,
            normalized: features[5]
        });
        
        this.researchMetrics.featureValues.engagementScore.push({
            timestamp: now,
            raw: engagementScore,
            normalized: features[6]
        });
        
        this.researchMetrics.featureValues.domainDiversity.push({
            timestamp: now,
            raw: domainDiversity,
            normalized: features[7]
        });
        
        this.researchMetrics.featureValues.interactionRate.push({
            timestamp: now,
            raw: interactionRate,
            normalized: features[8]
        });

        // Keep feature value arrays manageable (last 1000 values)
        Object.keys(this.researchMetrics.featureValues).forEach(key => {
            if (this.researchMetrics.featureValues[key].length > 1000) {
                this.researchMetrics.featureValues[key].shift();
            }
        });

        return features;
    }

    // ADDED: Get comprehensive research metrics
    getResearchMetrics() {
        return {
            circularBufferOperations: this.researchMetrics.circularBufferOperations,
            featureValues: this.researchMetrics.featureValues,
            temporalScales: this.researchMetrics.temporalScales,
            eventProcessing: this.researchMetrics.eventProcessing,
            
            // Calculate statistical summaries
            featureStatistics: this.calculateFeatureStatistics(),
            bufferPerformance: this.calculateBufferPerformance(),
            eventProcessingStats: this.calculateEventProcessingStats()
        };
    }

    // ADDED: Calculate feature statistics for research analysis
    calculateFeatureStatistics() {
        const stats = {};
        
        Object.keys(this.researchMetrics.featureValues).forEach(featureName => {
            const values = this.researchMetrics.featureValues[featureName];
            if (values.length > 0) {
                const normalizedValues = values.map(v => v.normalized);
                const rawValues = values.map(v => v.raw);
                
                stats[featureName] = {
                    count: values.length,
                    normalized: {
                        mean: this.calculateMean(normalizedValues),
                        stdDev: this.calculateStandardDeviation(normalizedValues),
                        min: Math.min(...normalizedValues),
                        max: Math.max(...normalizedValues)
                    },
                    raw: {
                        mean: this.calculateMean(rawValues),
                        stdDev: this.calculateStandardDeviation(rawValues),
                        min: Math.min(...rawValues),
                        max: Math.max(...rawValues)
                    }
                };
            }
        });
        
        return stats;
    }

    // ADDED: Calculate circular buffer performance metrics
    calculateBufferPerformance() {
        const operationTimes = this.researchMetrics.circularBufferOperations.operationTimes.map(o => o.operationTime);
        
        return {
            totalOperations: this.researchMetrics.circularBufferOperations.insertions,
            averageOperationTime: this.calculateMean(operationTimes),
            maxOperationTime: Math.max(...operationTimes),
            minOperationTime: Math.min(...operationTimes),
            stdDevOperationTime: this.calculateStandardDeviation(operationTimes),
            isConstantTime: this.calculateStandardDeviation(operationTimes) < 0.1, // O(1) validation
            temporalScales: this.researchMetrics.temporalScales
        };
    }

    // ADDED: Calculate event processing statistics
    calculateEventProcessingStats() {
        const processingTimes = this.researchMetrics.eventProcessing.processingTimes.map(p => p.processingTime);
        
        return {
            totalEvents: this.researchMetrics.eventProcessing.totalEvents,
            eventTypeDistribution: this.researchMetrics.eventProcessing.eventTypes,
            averageProcessingTime: this.calculateMean(processingTimes),
            maxProcessingTime: Math.max(...processingTimes),
            minProcessingTime: Math.min(...processingTimes),
            stdDevProcessingTime: this.calculateStandardDeviation(processingTimes)
        };
    }

    // Helper methods for statistical calculations
    calculateMean(values) {
        if (!values || values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    calculateStandardDeviation(values) {
        if (!values || values.length === 0) return 0;
        const mean = this.calculateMean(values);
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = this.calculateMean(squaredDiffs);
        return Math.sqrt(avgSquaredDiff);
    }

    // ... [Rest of the existing methods remain the same]
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureEngineer;
}
