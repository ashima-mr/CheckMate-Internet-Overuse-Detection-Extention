class WebsiteManager {
  constructor() {
    this.websites = {};
    this.currentFilter = 'all';
    this.init();
  }

  async init() {
    await this.loadWebsites();
    this.setupEventListeners();
    this.render();
  }

  setupEventListeners() {
    document.getElementById('addBtn').addEventListener('click', () => {
      this.addWebsite();
    });

    document.getElementById('hostInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addWebsite();
      }
    });

    // Filter tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    // Bulk actions
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportCategories();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importCategories(e.target.files[0]);
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
      this.clearAllCategories();
    });
  }

  async loadWebsites() {
    const result = await chrome.storage.sync.get({ siteCategories: {} });
    this.websites = result.siteCategories;
  }

  async saveWebsites() {
    await chrome.storage.sync.set({ siteCategories: this.websites });
  }

  addWebsite() {
    const hostInput = document.getElementById('hostInput');
    const categorySelect = document.getElementById('categorySelect');
    
    const host = hostInput.value.trim().toLowerCase();
    const category = categorySelect.value;

    if (!host) {
      this.showError('Please enter a website domain');
      return;
    }

    // Validate domain format
    if (!this.isValidDomain(host)) {
      this.showError('Please enter a valid domain (e.g., example.com)');
      return;
    }

    this.websites[host] = {
      category: category,
      added: new Date().toISOString()
    };

    this.saveWebsites();
    this.render();
    
    // Clear inputs
    hostInput.value = '';
    categorySelect.value = 'productive';
    
    this.showSuccess(`Added ${host} as ${category}`);
  }

  removeWebsite(host) {
    if (confirm(`Remove ${host} from categories?`)) {
      delete this.websites[host];
      this.saveWebsites();
      this.render();
      this.showSuccess(`Removed ${host}`);
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    this.render();
  }

  render() {
    const tbody = document.getElementById('websiteList');
    tbody.innerHTML = '';

    const filteredWebsites = Object.entries(this.websites).filter(([host, data]) => {
      return this.currentFilter === 'all' || data.category === this.currentFilter;
    });

    if (filteredWebsites.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No websites in this category</td></tr>';
      return;
    }

    filteredWebsites.forEach(([host, data]) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${host}</td>
        <td><span class="category-badge category-${data.category}">${this.getCategoryLabel(data.category)}</span></td>
        <td>${new Date(data.added).toLocaleDateString()}</td>
        <td>
          <button class="btn-small btn-secondary" onclick="websiteManager.editWebsite('${host}')">Edit</button>
          <button class="btn-small btn-danger" onclick="websiteManager.removeWebsite('${host}')">Remove</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  getCategoryLabel(category) {
    const labels = {
      'productive': '✅ Productive',
      'unproductive': '😐 Unproductive', 
      'unhealthy': '⚠️ Unhealthy'
    };
    return labels[category] || category;
  }

  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  exportCategories() {
    const data = {
      version: '1.0',
      exported: new Date().toISOString(),
      categories: this.websites
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checkmate-categories.json';
    a.click();
    
    URL.revokeObjectURL(url);
    this.showSuccess('Categories exported successfully');
  }

  async importCategories(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.categories) {
        const confirmImport = confirm(`Import ${Object.keys(data.categories).length} website categories? This will merge with existing categories.`);
        
        if (confirmImport) {
          this.websites = { ...this.websites, ...data.categories };
          await this.saveWebsites();
          this.render();
          this.showSuccess('Categories imported successfully');
        }
      } else {
        this.showError('Invalid import file format');
      }
    } catch (error) {
      this.showError('Failed to import file: ' + error.message);
    }
  }

  async clearAllCategories() {
    const confirm = prompt('Type "DELETE" to confirm clearing all website categories:');
    if (confirm === 'DELETE') {
      this.websites = {};
      await this.saveWebsites();
      this.render();
      this.showSuccess('All categories cleared');
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

const websiteManager = new WebsiteManager();
