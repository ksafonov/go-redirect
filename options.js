// Storage keys
const REMOTE_URL_KEY = 'remoteUrl';
const REMOTE_CONFIG_KEY = 'remoteConfig';
const LOCAL_OVERRIDES_KEY = 'localOverrides';
const LAST_REMOTE_FETCH_KEY = 'lastRemoteFetch';

let remoteConfig = {};
let localOverrides = {};

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

// Load all data
async function loadData() {
  try {
    const result = await chrome.storage.local.get([
      REMOTE_URL_KEY,
      REMOTE_CONFIG_KEY,
      LOCAL_OVERRIDES_KEY,
      LAST_REMOTE_FETCH_KEY
    ]);

    remoteConfig = result[REMOTE_CONFIG_KEY] || {};
    localOverrides = result[LOCAL_OVERRIDES_KEY] || {};

    // Set remote URL if exists
    if (result[REMOTE_URL_KEY]) {
      document.getElementById('remoteUrl').value = result[REMOTE_URL_KEY];
    }

    // Display last fetch time
    if (result[LAST_REMOTE_FETCH_KEY]) {
      const date = new Date(result[LAST_REMOTE_FETCH_KEY]);
      document.getElementById('lastUpdateTime').textContent = date.toLocaleString();
    }

    // If no data at all, load from default config.json
    if (Object.keys(remoteConfig).length === 0 && Object.keys(localOverrides).length === 0) {
      const configUrl = chrome.runtime.getURL('config.json');
      const response = await fetch(configUrl);
      const config = await response.json();
      localOverrides = config;
    }

    renderTable();
  } catch (error) {
    showStatus('Failed to load configuration: ' + error.message, 'error', 'status');
  }
}

// Render the mappings table
function renderTable() {
  const tbody = document.getElementById('mappingsBody');
  tbody.innerHTML = '';

  // Only show local overrides
  const entries = Object.entries(localOverrides);

  if (entries.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="3">No mappings yet. Click "Add Mapping" below.</td></tr>';
    return;
  }

  entries.forEach(([shortcut, url]) => {
    const row = createRow(shortcut, url);
    tbody.appendChild(row);
  });
}

// Get merged config (remote + local, with local overriding remote)
function getMergedConfig() {
  return { ...remoteConfig, ...localOverrides };
}

// Create a table row
function createRow(shortcut, url) {
  const row = document.createElement('tr');
  row.dataset.shortcut = shortcut;

  // Shortcut cell
  const shortcutCell = document.createElement('td');
  const shortcutInput = document.createElement('input');
  shortcutInput.type = 'text';
  shortcutInput.value = shortcut;
  shortcutInput.dataset.originalShortcut = shortcut;
  shortcutCell.appendChild(shortcutInput);
  row.appendChild(shortcutCell);

  // URL cell
  const urlCell = document.createElement('td');
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = url;
  urlCell.appendChild(urlInput);
  row.appendChild(urlCell);

  // Action cell
  const actionCell = document.createElement('td');
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = () => deleteRow(row);
  actionCell.appendChild(deleteBtn);
  row.appendChild(actionCell);

  return row;
}

// Delete a row
function deleteRow(row) {
  if (confirm('Delete this mapping?')) {
    row.remove();

    // If table is empty, show empty state
    const tbody = document.getElementById('mappingsBody');
    if (tbody.children.length === 0) {
      tbody.innerHTML = '<tr class="empty-state"><td colspan="3">No mappings yet. Click "Add Mapping" below.</td></tr>';
    }
  }
}

// Add new mapping
document.getElementById('addMapping').addEventListener('click', () => {
  const tbody = document.getElementById('mappingsBody');

  // Remove empty state if present
  const emptyState = tbody.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const row = createRow('', '');
  tbody.appendChild(row);

  // Focus on the shortcut input
  row.querySelector('input').focus();
});

// Fetch remote config
document.getElementById('fetchRemote').addEventListener('click', async () => {
  const url = document.getElementById('remoteUrl').value.trim();

  if (!url) {
    showStatus('Please enter a remote URL', 'error', 'remoteStatus');
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    showStatus('Invalid URL format', 'error', 'remoteStatus');
    return;
  }

  const btn = document.getElementById('fetchRemote');
  btn.disabled = true;
  btn.textContent = 'Fetching...';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const config = await response.json();

    // Validate it's an object
    if (typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Config must be a JSON object');
    }

    remoteConfig = config;

    const now = new Date().toISOString();

    // Save remote URL, config, and timestamp
    await chrome.storage.local.set({
      [REMOTE_URL_KEY]: url,
      [REMOTE_CONFIG_KEY]: config,
      [LAST_REMOTE_FETCH_KEY]: now
    });

    // Update displayed time
    const date = new Date(now);
    document.getElementById('lastUpdateTime').textContent = date.toLocaleString();

    // Merge and save to cache
    const merged = { ...remoteConfig, ...localOverrides };
    await chrome.storage.local.set({
      linksCache: merged
    });

    // Setup periodic refresh and reload in background
    chrome.runtime.sendMessage({ action: 'setupRemoteRefresh' });
    chrome.runtime.sendMessage({ action: 'reloadConfig' });

    renderTable();
    showStatus(`Fetched ${Object.keys(config).length} mappings from remote. Auto-refresh enabled (every 30 minutes).`, 'success', 'remoteStatus');
  } catch (error) {
    showStatus('Failed to fetch: ' + error.message, 'error', 'remoteStatus');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch Now';
  }
});

// Save configuration
document.getElementById('save').addEventListener('click', async () => {
  const tbody = document.getElementById('mappingsBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-state)');

  const newLocalOverrides = {};
  const errors = [];

  // Collect and validate all entries
  rows.forEach((row, index) => {
    const shortcutInput = row.querySelector('td:nth-child(1) input');
    const urlInput = row.querySelector('td:nth-child(2) input');

    const shortcut = shortcutInput.value.trim();
    const url = urlInput.value.trim();

    if (!shortcut) {
      errors.push(`Row ${index + 1}: Shortcut cannot be empty`);
      return;
    }

    if (!url) {
      errors.push(`Row ${index + 1}: URL cannot be empty`);
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      errors.push(`Row ${index + 1}: Invalid URL format`);
      return;
    }

    // Check for duplicates
    if (newLocalOverrides.hasOwnProperty(shortcut)) {
      errors.push(`Duplicate shortcut: "${shortcut}"`);
      return;
    }

    newLocalOverrides[shortcut] = url;
  });

  if (errors.length > 0) {
    showStatus(errors.join('\n'), 'error', 'status');
    return;
  }

  // Save local overrides
  localOverrides = newLocalOverrides;

  try {
    await chrome.storage.local.set({
      [LOCAL_OVERRIDES_KEY]: localOverrides
    });

    // Merge and save to cache
    const merged = getMergedConfig();
    await chrome.storage.local.set({
      linksCache: merged
    });

    // Reload in background
    chrome.runtime.sendMessage({ action: 'reloadConfig' });

    showStatus('Configuration saved successfully!', 'success', 'status');

    // Re-render to update source badges
    renderTable();
  } catch (error) {
    showStatus('Failed to save: ' + error.message, 'error', 'status');
  }
});

// Reset all
document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm('Reset all configuration? This will clear remote URL and all local mappings, and reload from config.json.')) {
    return;
  }

  try {
    // Clear everything including last fetch time
    await chrome.storage.local.remove([
      REMOTE_URL_KEY,
      REMOTE_CONFIG_KEY,
      LOCAL_OVERRIDES_KEY,
      LAST_REMOTE_FETCH_KEY,
      'linksCache'
    ]);

    // Clear the alarm
    chrome.alarms.clear('refreshRemoteConfig');

    // Reload from default
    const configUrl = chrome.runtime.getURL('config.json');
    const response = await fetch(configUrl);
    const config = await response.json();

    remoteConfig = {};
    localOverrides = config;

    await chrome.storage.local.set({
      [LOCAL_OVERRIDES_KEY]: localOverrides,
      linksCache: config
    });

    document.getElementById('remoteUrl').value = '';
    document.getElementById('lastUpdateTime').textContent = 'Never';
    renderTable();

    // Reload in background
    chrome.runtime.sendMessage({ action: 'reloadConfig' });

    showStatus('Reset to default configuration', 'success', 'status');
  } catch (error) {
    showStatus('Failed to reset: ' + error.message, 'error', 'status');
  }
});

// Show status message
function showStatus(message, type, elementId) {
  const statusDiv = document.getElementById(elementId);
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.whiteSpace = 'pre-line';

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 5000);
  }
}
