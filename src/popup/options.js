// Storage key
const KEY = 'siteCategories';

// In-memory cache of the mapping
let map = {};

// Elements
const hostEl = document.getElementById('host');
const catEl = document.getElementById('category');
const addBtn = document.getElementById('add');
const listTbody = document.getElementById('list');

// Render the table of current rules
function render() {
  listTbody.innerHTML = '';
  for (const [host, cat] of Object.entries(map)) {
    const row = document.createElement('tr');
    const hostTd = document.createElement('td');
    hostTd.textContent = host;

    const catTd = document.createElement('td');
    catTd.textContent = cat;

    const actTd = document.createElement('td');
    const rm = document.createElement('button');
    rm.textContent = 'Remove';
    rm.onclick = () => removeRule(host);
    actTd.append(rm);

    row.append(hostTd, catTd, actTd);
    listTbody.append(row);
  }
}

// Load mapping from storage and render
function load() {
  chrome.storage.sync.get({ [KEY]: {} }, data => {
    map = data[KEY];
    render();
  });
}

// Save mapping to storage
function save() {
  chrome.storage.sync.set({ [KEY]: map });
}

// Add new rule
addBtn.addEventListener('click', () => {
  const host = hostEl.value.trim();
  if (!host) return;
  map[host] = catEl.value;
  save();
  render();
  hostEl.value = '';
});

// Remove a rule
function removeRule(host) {
  delete map[host];
  save();
  render();
}

// Initialize
document.addEventListener('DOMContentLoaded', load);
