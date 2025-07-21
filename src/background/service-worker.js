import FeatureEngineer from '../analysis/feature-engineer.js';
import WeightedVoter from '../analysis/weighted-voting.js';
import HoeffdingTree from '../models/hoeffding-tree.js';
import { MSPC } from '../models/mspc.js';
import MetricsCollector from '../analysis/metrics.js';

// ── Promisified Chrome APIs ──────────────────────────────────────────────
function createNotificationAsync(id, options) {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(id, options, (createdId) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(createdId);
    });
  });
}

function clearNotificationAsync(id) {
  return new Promise((resolve, reject) => {
    chrome.notifications.clear(id, (wasCleared) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(wasCleared);
    });
  });
}

function createAlarmAsync(name, info) {
  return new Promise((resolve, reject) => {
    chrome.alarms.create(name, info);
    // chrome.alarms.create has no callback, so immediately check for errors
    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
    else resolve(name);
  });
}

function clearAlarmAsync(name) {
  return new Promise((resolve, reject) => {
    chrome.alarms.clear(name, (wasCleared) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(wasCleared);
    });
  });
}
// ─────────────────────────────────────────────────────────────────────────

const MAX_SESSIONS = 100; // Maximum number of session entries to retain

// Constants for notification scheduling
const NOTIFICATION_SCHEDULE = [
  { threshold: 1000, interval: 15 },    // 15 minutes
  { threshold: 2000, interval: 30 },    // 30 minutes  
  { threshold: 3000, interval: 60 },    // 1 hour
  { threshold: 4000, interval: 240 },   // 4 hours
  { threshold: 5000, interval: 360 },   // 6 hours
  { threshold: 6000, interval: 720 },   // 12 hours
  { threshold: 7000, interval: 840 },   // 14 hours
  { threshold: 8000, interval: 1440 },  // 1 day
  { threshold: 9000, interval: 4320 },  // 3 days
  { threshold: 10000, interval: 7200 }, // 5 days
  { threshold: 11000, interval: 10080 } // 1 week (permanent)
];

const ALARM_NAME = 'feedbackNotification';
const OVERUSE_ALARM = 'overuseDetection';

// System state
let systemState = {
  isTracking: true,
  totalInteractions: 0,
  currentNotificationLevel: 0,
  lastProcessingTime: 0,
  systemInitialized: false
};

// Core system components
let featureEngineer = null;
let weightedVoter = null;
let metricsCollector = null;
let aucWorker = null;
let metricsWorker = null;

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  // Feedback notifications start with 'feedback_'
  if (notificationId.startsWith('feedback_')) {
    if (buttonIndex === 0) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?feedback=true') });
    }
    clearNotificationAsync(notificationId);
    return;
  }

  // Overuse notifications start with 'overuse_'
  if (notificationId.startsWith('overuse_')) {
    if (buttonIndex === 0) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?overuse=true') });
    }
    clearNotificationAsync(notificationId);
    return;
  }
});

function initWorkers() {
  // Terminate any existing workers
  if (aucWorker) {
    aucWorker.terminate();
    aucWorker = null;
  }
  if (metricsWorker) {
    metricsWorker.terminate();
    metricsWorker = null;
  }

  // Create fresh workers
  aucWorker = new Worker(chrome.runtime.getURL('workers/auc-worker.js'));
  metricsWorker = new Worker(chrome.runtime.getURL('workers/metrics-worker.js'));

  aucWorker.onmessage = handleWorkerMessage;
  metricsWorker.onmessage = handleWorkerMessage;
  aucWorker.onerror = e => console.error('AUC Worker error:', e);
  metricsWorker.onerror = e => console.error('Metrics Worker error:', e);

  console.log('✅ Web workers (re)initialized');
}

// Storage keys
const STORAGE_KEYS = {
  SYSTEM_STATE: 'systemState',
  INTERACTION_COUNT: 'totalInteractions',
  NOTIFICATION_LEVEL: 'notificationLevel',
  ML_MODELS: 'mlModels',
  METRICS_DATA: 'metricsData',
  SESSION_DATA: 'sessionData',
  SESSION_BUFFER: 'sessionBuffer'
};

/**
 * Initialize the service worker and system components
 */
async function initializeSystem() {
  try {
    console.log('🚀 Initializing Internet Overuse Detection System');

    // Load saved state
    await loadSystemState();

    // Initialize ML components
    const hoeffdingTree = new HoeffdingTree({ 
      nFeatures: 15,
      nClasses: 3,
      classLabels: ['productive', 'non-productive', 'overuse']
    });
    
    const mspc = new MSPC(6);
    
    featureEngineer = new FeatureEngineer();
    weightedVoter = new WeightedVoter({ 
      tree: hoeffdingTree, 
      mspc: mspc 
    });
    
    metricsCollector = new MetricsCollector();

    // Initialize web workers
    initWorkers();

    // Set up notification scheduling
    await setupNotificationSchedule();

    systemState.systemInitialized = true;
    await saveSystemState();

    await purgeOldSessions();

    console.log('✅ System initialization complete');
  } catch (error) {
    console.error('❌ System initialization failed:', error);
    await handleSystemError(error);
  }
}

/**
 * Handle worker messages
 */
function handleWorkerMessage(event) {
  const { type, result, id, error } = event.data;
  
  if (error) {
    console.error(`Worker error (${type}):`, error);
    return;
  }

  // Process worker results
  switch (type) {
    case 'calculateAUCResult':
      metricsCollector.handleAucResults(result);
      break;
    case 'processPerformanceMetricsResult':
      metricsCollector.handleMetricsResults(result);
      break;
    default:
      console.log(`Received worker result: ${type}`);
  }
}

/**
 * Set up notification scheduling based on interaction count
 */
async function setupNotificationSchedule() {
  try {
    const rawLevel = getCurrentNotificationLevel();
    const level = Math.min(rawLevel, NOTIFICATION_SCHEDULE.length - 1);
    const intervalMinutes = NOTIFICATION_SCHEDULE[level].interval;

    await clearAlarmAsync(ALARM_NAME);

    // Clear existing alarms
    await createAlarmAsync(ALARM_NAME, {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes
    });

    console.log(`📅 Notification schedule set: ${intervalMinutes} minutes`);
  } catch (error) {
    console.error('Failed to setup notification schedule:', error);
  }
}

/**
 * Get current notification level based on interaction count
 */
function getCurrentNotificationLevel() {
  for (let i = NOTIFICATION_SCHEDULE.length - 1; i >= 0; i--) {
    if (systemState.totalInteractions >= NOTIFICATION_SCHEDULE[i].threshold) {
      return i;
    }
  }
  return 0; // Default to first level
}

/**
 * Event Listeners Setup
 */

// Extension installation/startup
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  await initializeSystem();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup');
  await initializeSystem();
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep message channel open for async responses
});

// Alarm handling for notifications
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await showFeedbackNotification();
  } else if (alarm.name === OVERUSE_ALARM) {
    await handleOveruseDetection();
  }
});

// Tab updates for tracking
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && systemState.isTracking) {
    await injectContentScript(tabId, tab.url);
  }
});

// Tab removal cleanup
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await handleTabClosed(tabId);
});

/**
 * Main message handler
 */
async function handleMessage(message, sender, sendResponse) {
  const startTime = performance.now();

  try {
    switch (message.type) {
      case 'BATCH_STATS':
        await processBatchStats(message.data, message.mspcVector, sender);
        break;
        
      case 'FINAL_STATS':
        await processFinalStats(message.data, message.mspcVector, sender);
        break;
        
      case 'VISIBILITY_CHANGE':
        await handleVisibilityChange(message, sender);
        break;
        
      case 'USER_FEEDBACK':
        await handleUserFeedback(message.data);
        break;
        
      case 'GET_CURRENT_STATS':
        sendResponse(await getCurrentStats());
        break;
        
      case 'GET_SESSION_STATS':
        sendResponse(await getSessionStats(message.tabId));
        break;
        
      case 'RESET_SYSTEM':
        await resetSystem();
        sendResponse({ success: true });
        break;
        
      case 'PAUSE_TRACKING':
        await pauseTracking();
        sendResponse({ success: true });
        break;
        
      case 'RESUME_TRACKING':
        await resumeTracking();
        sendResponse({ success: true });
        break;
        
      case 'DELETE_ALL_DATA':
        await deleteAllData();
        sendResponse({ success: true });
        break;
        
      case 'GET_SYSTEM_STATUS':
        sendResponse(getSystemStatus());
        break;
        
      case 'SHOW_OVERUSE_NOTIFICATION':
        await showOveruseNotification(message.data);
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }

    // Record processing latency
    const duration = performance.now() - startTime;
    if (metricsCollector) {
        metricsCollector.recordProcessingLatency(message.type, startTime);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Process batch statistics from content scripts
 */
async function processBatchStats(data, mspcVector, sender) {
  if (!systemState.isTracking || !systemState.systemInitialized) return;

  try {
    // Update interaction count
    const newInteractions = Object.values(data.interactionCounts).reduce((a, b) => a + b, 0);
    systemState.totalInteractions += newInteractions;

    // Check if notification level should be updated
    const newLevel = getCurrentNotificationLevel();
    if (newLevel !== systemState.currentNotificationLevel) {
      systemState.currentNotificationLevel = newLevel;
      await setupNotificationSchedule();
    }

    // Process through feature engineering
    const message = {
      type: 'BATCH_STATS',
      data: data,
      mspcVector: mspcVector
    };
    
    featureEngineer.ingest(message);

    // Get the processed feature vector
    const session = featureEngineer.sessions.get(String(data.tabID));
    if (session && session.lastVec) {
      // Perform weighted voting
      const mspcVectorArray = mspcVector ? new Float64Array(mspcVector) : new Float64Array(6);
      const votingResult = weightedVoter.vote(mspcVectorArray, session.lastVec);

      // Update metrics
      metricsCollector.recordVotingAgreement(
        votingResult.mspcVote,
        votingResult.hatOriginal,
        votingResult.vote,
        1, // ground truth class
        votingResult.hatscore,
        votingResult.confidence
      );

      // Check for overuse detection
      if (votingResult.vote === 2) {
        await scheduleOveruseNotification(votingResult);
      }

      // Send results to UI if popup is open
      await broadcastToUI({
        type: 'PREDICTION_UPDATE',
        data: {
          tabId: String(data.tabID),
          prediction: votingResult,
          hatOutput: hatscore,
          timestamp: Date.now(),
          totalInteractions: systemState.totalInteractions
        }
      });
    }

    await saveSystemState();
    
  } catch (error) {
    console.error('Error processing batch stats:', error);
  }
}

/**
 * Process final statistics when tab closes
 */
async function processFinalStats(data, mspcVector, sender) {
  if (!systemState.systemInitialized) return;

  try {
    const message = { type: 'FINAL_STATS', data, mspcVector };
    featureEngineer.ingest(message);

    /* ---------- real-time prediction on the final vector ---------- */
    const session = featureEngineer.sessions.get(String(data.tabID));
    if (session && session.lastVec) {
      const mspcArr = mspcVector
        ? new Float64Array(mspcVector)
        : new Float64Array(6);
      const votingResult = weightedVoter.vote(mspcArr, session.lastVec);

      // Record metrics
      metricsCollector.recordVotingAgreement(
        votingResult.mspcVote,
        votingResult.hatOriginal,
        votingResult.vote,
        1,
        votingResult.hatscore,
        votingResult.confidence
      );

      // Possible over-use notification
      if (votingResult.vote === 2) {
        await scheduleOveruseNotification(votingResult);
      }

      // Broadcast to UI
      await broadcastToUI({
        type: 'PREDICTION_UPDATE',
        data: {
          tabId: String(data.tabID),
          prediction: votingResult,
          hatOutput: hatscore,
          timestamp: Date.now(),
          totalInteractions: systemState.totalInteractions
        }
      });
    }
    /* ----------------------------------------------------------------------- */

    // Persist session summary
    const entry = {
      tabId: String(data.tabID),
      data,
      timestamp: Date.now(),
      domain: data.domain
    };
    const buffer = await loadSessionBuffer();
    buffer.push(entry);
    if (buffer.length > MAX_SESSIONS) buffer.shift();
    await saveSessionBuffer(buffer);

  } catch (error) {
    console.error('Error processing final stats:', error);
  }
}

/**
 * Handle user feedback for model training
 */
async function handleUserFeedback(feedbackData) {
  try {
    const { tabId, classValue, confidence = 1.0 } = feedbackData;
    
    // Add feedback to feature engineer
    featureEngineer.addUserFeedback(tabId, classValue, confidence);

    // Update metrics
    if (typeof feedbackData.predictedClass !== 'number') {
        throw new Error('Missing predictedClass in feedbackData');
    }
    metricsCollector.updateConfusionMatrix(
      feedbackData.predictedClass,
      classValue,
      confidence
    );
    console.log('✅ User feedback processed:', feedbackData);
    
  } catch (error) {
    console.error('Error handling user feedback:', error);
  }
}

/**
 * Show feedback collection notification
 */
async function showFeedbackNotification() {
  try {
    const notificationId = `feedback_${Date.now()}`;
    
    await createNotificationAsync(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'Internet Usage Feedback',
      message: 'Help improve our detection by providing feedback on your recent browsing behavior.',
      buttons: [
        { title: 'Provide Feedback' },
        { title: 'Not Now' }
      ],
      priority: 1
    });

  } catch (error) {
    console.error('Error showing feedback notification:', error);
  }
}

/**
 * Show overuse detection notification
 */
async function showOveruseNotification(data) {
  try {
    const notificationId = `overuse_${Date.now()}`;
    
    await createNotificationAsync(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/warning.png'),
      title: 'Potential Internet Overuse Detected',
      message: `Our analysis suggests you might be experiencing internet overuse.`, /*Confidence: ${Math.round(data.confidence * 100)}%*/
      buttons: [
        { title: 'View Details' },
        { title: 'Dismiss' }
      ],
      priority: 2
    });

  } catch (error) {
    console.error('Error showing overuse notification:', error);
  }
}

/**
 * Schedule overuse notification with rate limiting
 */
async function scheduleOveruseNotification(votingResult) {
  try {
    // Rate limit overuse notifications (max 1 per hour)
    const lastOveruseTime = await getLastOveruseNotificationTime();
    const now = Date.now();
    
    if (now - lastOveruseTime < 3600000) { // 1 hour
      return;
    }

    await createAlarmAsync(OVERUSE_ALARM, { delayInMinutes: 1 });

    await setLastOveruseNotificationTime(now);
    
  } catch (error) {
    console.error('Error scheduling overuse notification:', error);
  }
}

/**
 * Handle overuse detection alarm
 */
async function handleOveruseDetection() {
  // Get recent prediction data
  const recentData = await getRecentPredictionData();
  if (recentData && recentData.prediction.vote === 2) {
    await showOveruseNotification(recentData.prediction);
  }
}

/**
 * User command handlers
 */

async function getCurrentStats() {
  try {
    const metrics = metricsCollector.exportAllMetrics();
    const systemStats = {
      totalInteractions: systemState.totalInteractions,
      isTracking: systemState.isTracking,
      currentNotificationLevel: systemState.currentNotificationLevel,
      systemInitialized: systemState.systemInitialized,
      lastProcessingTime: systemState.lastProcessingTime
    };

    return {
      system: systemStats,
      metrics: metrics,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error getting current stats:', error);
    return { error: error.message };
  }
}

async function getSessionStats(tabId) {
  try {
    const session = featureEngineer.sessions.get(tabId);
    if (!session) {
      return { error: 'Session not found' };
    }

    return {
      session: {
        id: session.id,
        domains: Array.from(session.domains),
        startTime: session.startTime,
        focusMs: session.focusMs,
        lastVector: session.lastVec,
        finalPatterns: session.finalPatterns,
        closed: session.closed,
        closedAt: session.closedAt
      },
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error getting session stats:', error);
    return { error: error.message };
  }
}

async function resetSystem() {
  try {
    console.log('🔄 Resetting system...');

    // Reset ML models
    if (weightedVoter && weightedVoter.tree) {
      weightedVoter.tree = new HoeffdingTree({ 
        nFeatures: 15,
        nClasses: 3,
        classLabels: ['productive', 'non-productive', 'overuse']
      });
    }

    if (weightedVoter && weightedVoter.mspc) {
      weightedVoter.mspc = new MSPC(6);
    }

    // Reset feature engineer
    featureEngineer = new FeatureEngineer();

    // Reset metrics
    metricsCollector = new MetricsCollector();

    // Keep interaction count and notification level
    await saveSystemState();

    await purgeOldSessions();

    console.log('✅ System reset complete');
  } catch (error) {
    console.error('Error resetting system:', error);
    throw error;
  }
}

async function purgeOldSessions() {
  const buf = await loadSessionBuffer();
  if (buf.length > MAX_SESSIONS) {
    await saveSessionBuffer(buf.slice(-MAX_SESSIONS));
    console.log(`🗑️ Purged sessions to last ${MAX_SESSIONS} entries`);
  }
}

async function pauseTracking() {
  systemState.isTracking = false;
  await saveSystemState();
  console.log('⏸️ Tracking paused');
}

async function resumeTracking() {
  systemState.isTracking = true;
  await saveSystemState();
  console.log('▶️ Tracking resumed');
}

async function deleteAllData() {
  try {
    console.log('🗑️ Deleting all data...');

    // Clear storage
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();

    // Reset system state
    systemState = {
      isTracking: true,
      totalInteractions: 0,
      currentNotificationLevel: 0,
      lastProcessingTime: 0,
      systemInitialized: false
    };

    // Reinitialize system
    await initializeSystem();

    console.log('✅ All data deleted and system reinitialized');
  } catch (error) {
    console.error('Error deleting all data:', error);
    throw error;
  }
}

function getSystemStatus() {
  return {
    state: systemState,
    components: {
      featureEngineer: !!featureEngineer,
      weightedVoter: !!weightedVoter,
      metricsCollector: !!metricsCollector,
      aucWorker: !!aucWorker,
      metricsWorker: !!metricsWorker
    },
    timestamp: Date.now()
  };
}

/**
 * Utility functions
 */

async function loadSystemState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYSTEM_STATE);
    if (result[STORAGE_KEYS.SYSTEM_STATE]) {
      systemState = { ...systemState, ...result[STORAGE_KEYS.SYSTEM_STATE] };
    }
  } catch (error) {
    console.error('Error loading system state:', error);
  }
}

async function saveSystemState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SYSTEM_STATE]: systemState
    });
  } catch (error) {
    console.error('Error saving system state:', error);
  }
}

async function injectContentScript(tabId, url) {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content-script.js']
    });

  } catch (error) {
    console.warn('Could not inject content script:', error);
  }
}

async function handleTabClosed(tabId) {
  // Clean up any tab-specific data
  featureEngineer.sessions.delete(tabId.toString());
}

async function handleVisibilityChange(message, sender) {
  // Track visibility changes for better analysis
  const tabId = sender.tab?.id || 'unknown';
  console.log(`Tab ${tabId} visibility: ${message.visibilityState}`);
}

async function broadcastToUI(message) {
  try {
    // Send message to popup if it's open
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    // Popup might not be open, which is fine
  }
}

async function getLastOveruseNotificationTime() {
  try {
    const result = await chrome.storage.local.get('lastOveruseTime');
    return result.lastOveruseTime || 0;
  } catch (error) {
    return 0;
  }
}

async function setLastOveruseNotificationTime(time) {
  try {
    await chrome.storage.local.set({ lastOveruseTime: time });
  } catch (error) {
    console.error('Error setting last overuse time:', error);
  }
}

async function getRecentPredictionData() {
  try {
    const result = await chrome.storage.local.get('recentPrediction');
    return result.recentPrediction;
  } catch (error) {
    return null;
  }
}

async function handleSystemError(error) {
  console.error('System error:', error);
  
    // Terminate any bad workers before recovery
  if (aucWorker) {
    aucWorker.terminate();
    aucWorker = null;
  }
  if (metricsWorker) {
    metricsWorker.terminate();
    metricsWorker = null;
  }

  // Try to recover
  try {
    await initializeSystem();
  } catch (recoveryError) {
    console.error('Recovery failed:', recoveryError);
  }
}

async function loadSessionBuffer() {
  const { sessionBuffer } = await chrome.storage.local.get(STORAGE_KEYS.SESSION_BUFFER);
  return Array.isArray(sessionBuffer) ? sessionBuffer : [];
}

async function saveSessionBuffer(buffer) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_BUFFER]: buffer });
}

/**
 * Memory and latency monitoring for debugging
 */
setInterval(async () => {
  if (systemState.systemInitialized) {
    try {
      // Memory usage tracking
      if (performance.measureUserAgentSpecificMemory) {
        const memInfo = await performance.measureUserAgentSpecificMemory();
        console.log('Memory usage:', memInfo.bytes);
      }

      // Performance metrics
      const perfMetrics = {
        timestamp: Date.now(),
        totalInteractions: systemState.totalInteractions,
        sessionsActive: featureEngineer?.sessions.size || 0,
        isTracking: systemState.isTracking
      };

      // Store for debugging
      await chrome.storage.local.set({
        lastPerfMetrics: perfMetrics
      });

    } catch (error) {
      console.error('Error in performance monitoring:', error);
    }
  }
}, 60000); // Every minute

// Initialize on script load
(async () => {
  await initializeSystem();
})();

console.log('🎯 Internet Overuse Detection Service Worker loaded');
