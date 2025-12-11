// Load status on popup open
document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  checkRemoteUrl();
});

// Load current status
function loadStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response) {
      document.getElementById('linksCount').textContent = response.linksCount;

      // Show the links
      if (response.links && Object.keys(response.links).length > 0) {
        const linksList = document.getElementById('linksList');
        const linksDisplay = document.getElementById('linksDisplay');

        const linksText = Object.keys(response.links)
          .map(key => `• ${key}`)
          .join('<br>');

        linksDisplay.innerHTML = linksText;
        linksList.style.display = 'block';
      }
    }
  });
}

// Check if remote URL is configured and show reload button
function checkRemoteUrl() {
  chrome.storage.local.get('remoteUrl', (result) => {
    const reloadBtn = document.getElementById('reload');
    if (result.remoteUrl) {
      reloadBtn.style.display = 'inline-block';
    } else {
      reloadBtn.style.display = 'none';
    }
  });
}

// Settings button handler
document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Reload button handler
document.getElementById('reload').addEventListener('click', () => {
  const button = document.getElementById('reload');
  button.disabled = true;
  button.textContent = 'Reloading...';

  chrome.runtime.sendMessage({ action: 'fetchRemoteConfig' }, (response) => {
    setTimeout(() => {
      loadStatus();
      button.disabled = false;
      button.textContent = 'Reload Remote Config';
    }, 500);
  });
});
