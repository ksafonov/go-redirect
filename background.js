// Constants
const LINKS_CACHE_KEY = 'linksCache';
const REMOTE_URL_KEY = 'remoteUrl';
const REMOTE_CONFIG_KEY = 'remoteConfig';
const LOCAL_OVERRIDES_KEY = 'localOverrides';
const LAST_REMOTE_FETCH_KEY = 'lastRemoteFetch';
const REFRESH_ALARM = 'refreshRemoteConfig';
const REFRESH_INTERVAL = 30; // minutes

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Go Links Redirector installed');
  loadConfig();
  setupRemoteRefresh();
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Go Links Redirector started');
  loadConfig();
  setupRemoteRefresh();
});

// Set up periodic remote config refresh
async function setupRemoteRefresh() {
  // Check if remote URL is configured
  const result = await chrome.storage.local.get(REMOTE_URL_KEY);

  if (result[REMOTE_URL_KEY]) {
    console.log('Remote URL configured, setting up periodic refresh');
    chrome.alarms.create(REFRESH_ALARM, {
      periodInMinutes: REFRESH_INTERVAL
    });
  } else {
    console.log('No remote URL configured, skipping periodic refresh');
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    console.log('Periodic refresh triggered');
    fetchRemoteConfig();
  }
});

// Fetch remote config
async function fetchRemoteConfig() {
  try {
    const result = await chrome.storage.local.get([REMOTE_URL_KEY, LOCAL_OVERRIDES_KEY]);
    const remoteUrl = result[REMOTE_URL_KEY];

    if (!remoteUrl) {
      console.log('No remote URL configured, skipping fetch');
      return;
    }

    console.log('Fetching remote config from:', remoteUrl);

    const response = await fetch(remoteUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const remoteConfig = await response.json();

    // Validate it's an object
    if (typeof remoteConfig !== 'object' || Array.isArray(remoteConfig)) {
      throw new Error('Config must be a JSON object');
    }

    console.log('Remote config fetched successfully:', remoteConfig);

    const now = new Date().toISOString();

    // Save remote config and timestamp
    await chrome.storage.local.set({
      [REMOTE_CONFIG_KEY]: remoteConfig,
      [LAST_REMOTE_FETCH_KEY]: now
    });

    // Merge with local overrides
    const localOverrides = result[LOCAL_OVERRIDES_KEY] || {};
    const merged = { ...remoteConfig, ...localOverrides };

    // Save merged config
    await chrome.storage.local.set({
      [LINKS_CACHE_KEY]: merged
    });

    // Reload config in background
    await loadConfig();

    console.log('Remote config applied successfully');
  } catch (error) {
    console.error('Failed to fetch remote config:', error);
    // Don't update timestamp on failure
  }
}

// Load configuration - check storage first, then static file
async function loadConfig() {
  try {
    console.log('Loading config...');

    // Check if there's a cached merged config
    const result = await chrome.storage.local.get(LINKS_CACHE_KEY);
    let config = result[LINKS_CACHE_KEY];

    // If no cached config, load from static file and cache it
    if (!config || Object.keys(config).length === 0) {
      console.log('No cached config found, loading from static file...');
      const configUrl = chrome.runtime.getURL('config.json');
      const response = await fetch(configUrl);

      if (!response.ok) {
        throw new Error(`Failed to load config.json: ${response.status}`);
      }

      config = await response.json();

      // Save to storage as linksCache
      await chrome.storage.local.set({
        [LINKS_CACHE_KEY]: config,
        localOverrides: config // Also save as local overrides for the UI
      });
    } else {
      console.log('Using cached config from storage');
    }

    console.log('Config loaded successfully:', config);

    // Set up declarativeNetRequest rules for go/* URLs
    await setupRedirectRules(config);

    console.log('Config loaded and rules updated');
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Set up redirect rules for go/* URLs
async function setupRedirectRules(config) {
  try {
    // Remove existing dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);

    // Create new rules from config
    const newRules = [];
    let ruleId = 1;

    for (const [shortLink, targetUrl] of Object.entries(config)) {
      newRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { url: targetUrl }
        },
        condition: {
          urlFilter: `*://go/${shortLink}`,
          resourceTypes: ['main_frame']
        }
      });
    }

    // Update the dynamic rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: newRules
    });

    console.log(`Set up ${newRules.length} redirect rules`);
  } catch (error) {
    console.error('Failed to set up redirect rules:', error);
  }
}

// Intercept navigation to catch go/* typed in address bar
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only process main frame navigations (not iframes)
  if (details.frameId !== 0) return;

  const url = details.url;
  console.log('Navigation detected:', url);

  // Check if this is a search URL with go/ pattern
  // Chrome's default search often uses google.com/search?q=go/something or bing, etc.
  if (url.includes('/search?') || url.includes('/search/?')) {
    const urlObj = new URL(url);
    const query = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');

    if (query) {
      console.log('Search query detected:', query);
      // Match go/something pattern
      const goMatch = query.match(/^go\/(.+)$/i);

      if (goMatch) {
        const shortLink = goMatch[1].trim();
        console.log(`Found go/${shortLink} in search, checking config...`);

        // Get the config and redirect
        chrome.storage.local.get(LINKS_CACHE_KEY, (result) => {
          const links = result[LINKS_CACHE_KEY] || {};
          const targetUrl = links[shortLink];

          if (targetUrl) {
            console.log(`Redirecting to: ${targetUrl}`);
            chrome.tabs.update(details.tabId, { url: targetUrl });
          } else {
            console.log(`No redirect found for: ${shortLink}`);
          }
        });
      }
    }
  }

  // Also check if URL itself contains go/ (like http://go/repo)
  if (url.includes('://go/')) {
    const match = url.match(/go\/(.+?)(?:[/?#]|$)/);
    if (match) {
      const shortLink = match[1];
      console.log(`Detected go/${shortLink} URL, attempting redirect...`);

      chrome.storage.local.get(LINKS_CACHE_KEY, (result) => {
        const links = result[LINKS_CACHE_KEY] || {};
        const targetUrl = links[shortLink];

        if (targetUrl) {
          console.log(`Redirecting to: ${targetUrl}`);
          chrome.tabs.update(details.tabId, { url: targetUrl });
        }
      });
    }
  }
});

// Handle omnibox input for suggestions
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  chrome.storage.local.get(LINKS_CACHE_KEY, (result) => {
    const links = result[LINKS_CACHE_KEY] || {};
    const suggestions = [];

    // Filter links that match the input
    for (const [shortLink, targetUrl] of Object.entries(links)) {
      if (shortLink.toLowerCase().includes(text.toLowerCase())) {
        suggestions.push({
          content: shortLink,
          description: `${shortLink} → ${targetUrl}`
        });
      }
    }

    // Limit to top 6 suggestions
    suggest(suggestions.slice(0, 6));
  });
});

// Handle omnibox input when user presses Enter
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  chrome.storage.local.get(LINKS_CACHE_KEY, (result) => {
    const links = result[LINKS_CACHE_KEY] || {};

    // Find exact match or first partial match
    let targetUrl = links[text];

    if (!targetUrl) {
      // Try to find a partial match
      const matches = Object.entries(links).filter(([key]) =>
        key.toLowerCase().includes(text.toLowerCase())
      );

      if (matches.length > 0) {
        targetUrl = matches[0][1];
      }
    }

    if (targetUrl) {
      // Navigate based on disposition
      if (disposition === 'currentTab') {
        chrome.tabs.update({ url: targetUrl });
      } else if (disposition === 'newForegroundTab') {
        chrome.tabs.create({ url: targetUrl });
      } else if (disposition === 'newBackgroundTab') {
        chrome.tabs.create({ url: targetUrl, active: false });
      }
    } else {
      console.warn(`No redirect found for: ${text}`);
    }
  });
});

// Listen for messages from popup and options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'reloadConfig') {
    loadConfig().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }

  if (message.action === 'setupRemoteRefresh') {
    setupRemoteRefresh().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }

  if (message.action === 'fetchRemoteConfig') {
    fetchRemoteConfig().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }

  if (message.action === 'getStatus') {
    chrome.storage.local.get([LINKS_CACHE_KEY], (result) => {
      const linksCount = result[LINKS_CACHE_KEY] ? Object.keys(result[LINKS_CACHE_KEY]).length : 0;
      sendResponse({
        linksCount: linksCount,
        links: result[LINKS_CACHE_KEY] || {}
      });
    });
    return true; // Will respond asynchronously
  }
});
