/**
 * Enhanced Feature Engineering module for behavioral pattern extraction
 * Includes all missing methods and user-defined category support
 */

class FeatureEngineer {
    constructor(options = {}) {
        this.primaryWindow = new CircularBuffer(120);    // 30-min window (15s intervals)
        this.baselineWindow = new CircularBuffer(480);   // 2-hour window
        this.shortWindow = new CircularBuffer(60);        // 15-min window
        
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
        
        // Load user-defined categories from storage
        this.loadUserCategories();
        
        // Listen for category updates
        this.setupCategoryListener();
    }

    /**
     * Load user-defined website categories from storage
     */
    async loadUserCategories() {
        try {
            const result = await chrome.storage.sync.get({ siteCategories: {} });
            this.websiteCategories = result.siteCategories;
        } catch (error) {
            console.warn('Failed to load user categories:', error);
            this.websiteCategories = {};
        }
    }

    /**
     * Setup listener for category updates
     */
    setupCategoryListener() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync' && changes.siteCategories) {
                    this.websiteCategories = changes.siteCategories.newValue || {};
                }
            });
        }
    }

    /**
     * Process incoming browser events
     */
    processEvent(event) {
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

        // Update activity windows
        this.updateActivityWindows(event);
    }

    /**
     * Handle tab activation events
     */
    handleTabActivated(event) {
        this.currentSession.tabSwitches++;
        this.currentSession.lastActivityTime = event.timestamp;
        
        if (event.url) {
            const domain = this.extractDomain(event.url);
            this.currentSession.domains.add(domain);
            this.updateCategoryStats(domain);
        }
    }

    /**
     * Handle tab update events
     */
    handleTabUpdated(event) {
        if (event.url) {
            const domain = this.extractDomain(event.url);
            this.currentSession.domains.add(domain);
            this.currentSession.pageViews++;
            this.updateCategoryStats(domain);
        }
    }

    /**
     * Handle focus change events
     */
    handleFocusChange(event) {
        if (event.focused) {
            this.currentSession.lastActivityTime = event.timestamp;
        }
    }

    /**
     * Handle idle state changes
     */
    handleIdleState(event) {
        if (event.state === 'active') {
            this.currentSession.lastActivityTime = event.timestamp;
        }
    }

    /**
     * Handle page activity events from content script
     */
    handlePageActivity(event) {
        if (event.data) {
            this.currentSession.scrollEvents += event.data.scrollCount || 0;
            this.currentSession.clickEvents += event.data.clickCount || 0;
            this.currentSession.keystrokeEvents += event.data.keystrokes || 0;
            this.currentSession.totalActiveTime += event.data.timeOnPage || 0;
            
            if (event.data.isVisible) {
                this.currentSession.focusTime += (event.timestamp - this.currentSession.lastActivityTime);
                this.currentSession.lastActivityTime = event.timestamp;
            }
        }
    }

    /**
     * Handle scroll behavior events
     */
    handleScrollBehavior(event) {
        if (event.data) {
            this.currentSession.scrollEvents += event.data.count || 0;
        }
    }

    /**
     * Handle page session end events
     */
    handlePageSessionEnd(event) {
        if (event.data) {
            this.currentSession.totalActiveTime += event.data.totalTimeOnPage || 0;
        }
    }

    /**
     * Extract domain from URL
     */
    extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'unknown';
        }
    }

    /**
     * Update category statistics for a domain
     */
    updateCategoryStats(domain) {
        const category = this.websiteCategories[domain];
        if (category) {
            const currentCount = this.currentSession.websiteCategories.get(category) || 0;
            this.currentSession.websiteCategories.set(category, currentCount + 1);
        }
    }

    /**
     * Update activity windows with new event
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

        this.primaryWindow.push(dataPoint);    // New window names
        this.baselineWindow.push(dataPoint);
        this.shortWindow.push(dataPoint);
    }

    /**
     * Extract comprehensive features for ML model
     */
    extractFeatures() {
        const now = Date.now();
        const sessionDuration = now - this.currentSession.startTime;
        const sessionDurationHours = sessionDurationMs / (1000 * 60 * 60);
        const sessionDurationMinutes = sessionDurationMs / (1000 * 60);

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

        shortIntensity = this.calculateActivityIntensity(shortStats);
        mediumIntensity = this.calculateActivityIntensity(primaryWindowStats);
        const activityIntensity = 0.7 * shortIntensity + 0.3 * mediumIntensity;
        const engagementScore = this.calculateEngagementScore();

        // Content and behavioral features
        const categoryScore = this.calculateCategoryScore();
        const domainDiversity = this.calculateDomainDiversity();

        // Interaction features
        const interactionRate = this.calculateInteractionRate();

        return [
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
    }

    /**
     * Calculate statistics for a given window
     */
    calculateWindowStats(window) {
    const events = window.toArray();
    const stats = {
        eventCount: events.length,
        interactionSum: events.reduce((sum, e) => sum + (e.scrollEvents + e.clickEvents + e.keystrokeEvents), 0),
        startTime: events[0]?.timestamp || 0,
        endTime: events[events.length-1]?.timestamp || 0
    };
    stats.duration = stats.endTime - stats.startTime;
    return stats;
    }

    /**
     * Calculate time context score based on typical usage patterns
     */
    calculateTimeContextScore(hour, dayOfWeek) {
        // Higher scores indicate times typically associated with excessive browsing
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isLateNight = hour >= 23 || hour <= 2;
        const isEarlyMorning = hour >= 3 && hour <= 6;
        
        let score = 0.5; // Baseline
        
        if (isWeekend) score += 0.2;
        if (isLateNight) score += 0.3;
        if (isEarlyMorning) score += 0.4; // Very unusual browsing time
        
        return Math.min(score, 1.0);
    }

    /**
     * Calculate activity intensity based on user interactions
     */
    // NEW: Uses window-specific stats
    calculateActivityIntensity(windowStats) {
    if (windowStats.duration === 0) return 0;
    const interactionsPerMinute = windowStats.interactionSum / (windowStats.duration / (1000 * 60));
    return Math.min(interactionsPerMinute / 100, 1.0);
    }

    /**
     * Calculate engagement score
     */
    calculateEngagementScore() {
        const sessionDuration = Date.now() - this.currentSession.startTime;
        const activeRatio = this.currentSession.totalActiveTime / Math.max(sessionDuration, 1);
        const pageViewVelocity = this.currentSession.pageViews / Math.max(sessionDuration / (1000 * 60), 1);
        
        // High engagement could indicate overuse
        return Math.min((activeRatio * 0.7) + (pageViewVelocity / 10 * 0.3), 1.0);
    }

    /**
     * Calculate category score based on user-defined categories
     */
    calculateCategoryScore() {
        if (this.currentSession.websiteCategories.size === 0) {
            return 0.5; // Neutral baseline
        }

        const categoryWeights = {
            addictive: 1.0,
            distracting: 0.9,
            entertainment: 0.7,
            news: 0.6,
            shopping: 0.6,
            communication: 0.5,
            neutral: 0.5,
            tools: 0.4,
            learning: 0.3,
            work: 0.2,
            productive: 0.2,
            research: 0.1
        };

        let score = 0;
        let totalCount = 0;

        for (const [category, count] of this.currentSession.websiteCategories) {
            const weight = categoryWeights[category.toLowerCase()] ?? 0.5;
            score += count * weight;
            totalCount += count;
        }

        return totalCount > 0 ? score / totalCount : 0.5;
    }

    /**
     * Calculate domain diversity
     */
    calculateDomainDiversity() {
        const domainCount = this.currentSession.domains.size;
        const sessionHours = (Date.now() - this.currentSession.startTime) / (1000 * 60 * 60);
        
        // High domain diversity in short time might indicate restless browsing
        return Math.min(domainCount / Math.max(sessionHours, 0.25), 1.0);
    }

    /**
     * Calculate interaction rate
     */
    calculateInteractionRate() {
        const totalInteractions = this.currentSession.scrollEvents + 
                                 this.currentSession.clickEvents + 
                                 this.currentSession.keystrokeEvents;
        const sessionMinutes = (Date.now() - this.currentSession.startTime) / (1000 * 60);
        
        return Math.min(totalInteractions / Math.max(sessionMinutes, 1), 1.0);
    }

    // Normalization functions
    normalizeSessionDuration(minutes) {
        return Math.min(Math.tanh(minutes / 240), 1.0);  // 240 mins = 4 hours // Sigmoid-like normalization
    }

    normalizeTabSwitchVelocity(velocity) {
        return Math.min(Math.tanh(velocity / 10), 1.0);
    }

    normalizeFocusRatio(ratio) {
        return Math.max(0, Math.min(ratio, 1.0));
    }

    normalizeCategoryScore(score) {
        return Math.max(0, Math.min(score, 1.0));
    }

    normalizeTimeScore(score) {
        return Math.max(0, Math.min(score, 1.0));
    }

    normalizeActivityIntensity(intensity) {
        return Math.max(0, Math.min(intensity, 1.0));
    }

    normalizeEngagementScore(score) {
        return Math.max(0, Math.min(score, 1.0));
    }

    normalizeDomainDiversity(diversity) {
        return Math.max(0, Math.min(diversity, 1.0));
    }

    normalizeInteractionRate(rate) {
        return Math.max(0, Math.min(rate, 1.0));
    }

    /**
     * Reset session data
     */
    resetSession(timestamp = Date.now()) {
        this.currentSession = {
            startTime: timestamp,
            tabSwitches: 0,
            focusTime: 0,
            websiteCategories: new Map(),
            domains: new Set(),
            lastActivityTime: timestamp,
            scrollEvents: 0,
            clickEvents: 0,
            keystrokeEvents: 0,
            pageViews: 0,
            totalActiveTime: 0
        };
        
        this.eventHistory = [];
        this.primaryWindow = new CircularBuffer(120);
        this.baselineWindow = new CircularBuffer(480);
        this.shortWindow = new CircularBuffer(60);
    }

    /**
     * Get current session statistics
     */
    getSessionStats() {
        return {
            ...this.currentSession,
            sessionDuration: Date.now() - this.currentSession.startTime,
            domains: Array.from(this.currentSession.domains),
            categories: Object.fromEntries(this.currentSession.websiteCategories)
        };
    }

    /**
     * Get recent events for analysis
     */
    getRecentEvents(count = 10) {
        return this.eventHistory.slice(-count);
    }
}