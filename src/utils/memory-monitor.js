// src/utils/memory-monitor.js
class MemoryMonitor {
  constructor() {
    this.memoryLog = [];
    this.interval = null;
  }

  startMonitoring(interval = 30000) {
    this.interval = setInterval(async () => {
      try {
        const memoryUsage = await this.getMemoryUsage();
        this.memoryLog.push({
          timestamp: Date.now(),
          memory: memoryUsage
        });
        
        // Maintain log size (keep last 100 entries)
        if (this.memoryLog.length > 100) {
          this.memoryLog.shift();
        }
        
        // Store in chrome.storage
        chrome.storage.local.set({ memoryLog: this.memoryLog });
      } catch (error) {
        console.error('Memory monitoring error:', error);
      }
    }, interval);
  }

  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async getMemoryUsage() {
    return new Promise((resolve) => {
      // Get Chrome extension memory usage
      if (chrome.system && chrome.system.memory) {
        chrome.system.memory.getInfo((memInfo) => {
          resolve(memInfo.capacity - memInfo.availableCapacity);
        });
      } else {
        // Fallback: Estimate memory from storage usage
        chrome.storage.local.getBytesInUse((bytes) => {
          resolve(bytes);
        });
      }
    });
  }

  getCurrentMemory() {
    return this.memoryLog.length > 0 
      ? this.memoryLog[this.memoryLog.length - 1].memory 
      : 0;
  }

  getMemoryLog() {
    return this.memoryLog;
  }
}

// Initialize and export singleton instance
const memoryMonitor = new MemoryMonitor();
export default memoryMonitor;
