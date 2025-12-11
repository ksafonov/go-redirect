# Go Links Redirector - Chrome Extension

A Chrome extension that enables short link redirects (like `go/foo`) to predefined URLs using a static configuration file.

## Features

- **Two Ways to Redirect**:
  - Type `go/repo` directly in the address bar
  - Or use `golink` + Space + `repo` with autocomplete
- **Static Configuration**: Edit `config.json` file directly - no server needed
- **No Page Access**: Extension doesn't require access to web page contents
- **Simple & Fast**: No network requests, works offline

## Installation

### Method 1: Load Unpacked Extension (Development)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension directory
6. The extension is now installed!

### Method 2: Create Icons (Optional)

The extension references icon files. To create them:

1. Create an `icons` directory in the extension folder
2. Add three icon files: `icon16.png`, `icon48.png`, and `icon128.png`
3. You can use any image editor to create simple icons, or use placeholder images

Alternatively, remove the icon references from `manifest.json` if you don't need icons.

## Configuration

### Edit Configuration via Settings Page (Recommended)

1. Click the extension icon in your toolbar
2. Click "Edit Configuration"
3. **(Optional)** Configure a remote URL to fetch base mappings from a server
4. Manage your local shortcuts in the "Mappings Overrides" table:
   - **Add Mapping**: Click "+ Add Mapping" to create new shortcuts
   - **Edit**: Modify the shortcut name or target URL in the text fields
   - **Delete**: Remove unwanted shortcuts
5. Click "Save Configuration" to apply changes
6. Your shortcuts are immediately active!

### Remote Configuration (Optional)

You can specify a remote config URL to fetch shortcuts from a server. This is useful for sharing configurations across a team:

1. Enter your remote config URL (e.g., `https://your-server.com/config.json`)
2. Click "Fetch Now" to load remote mappings
3. Remote mappings are fetched and merged with your local overrides
4. Add local mappings in the "Mappings Overrides" table - these will **extend or override** remote ones
5. Local mappings are saved in your browser and always take precedence over remote ones

**How it works:**
- Remote config provides base shortcuts (fetched from server)
- Local overrides extend or override the remote config
- If a shortcut exists in both, the local version wins
- The "Mappings Overrides" table shows only your local overrides (not remote ones)

**Auto-refresh:**
- When a remote URL is configured, it is automatically fetched every **30 minutes**
- The "Last successful fetch" timestamp shows when the remote config was last successfully loaded
- If a fetch fails, the previous config continues to be used and the timestamp is not updated

### Alternative: Edit config.json File

You can also edit the `config.json` file directly in the extension directory, then reload the extension at `chrome://extensions/`.

### Use Your Short Links

**Method 1: Direct URL (Recommended)**
- Type `go/repo` directly in the address bar
- Press **Enter**
- Instantly redirected!

**Method 2: Omnibox with Autocomplete**
1. Type `golink` in the Chrome address bar
2. Press **Space** or **Tab**
3. Type the shortcut name (e.g., `repo`)
4. See suggestions as you type
5. Press **Enter** to redirect

## How It Works

1. **Static Config**: Reads shortcuts from `config.json` bundled with the extension
2. **URL Interception**: Uses `declarativeNetRequest` API to intercept `go/*` URLs
3. **Omnibox Integration**: Registers the "golink" keyword for autocomplete search
4. **Smart Suggestions**: Shows matching short links as you type in omnibox mode
5. **Privacy**: The extension doesn't access any web page content

## Files Structure

```
go-redirect/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for redirects
├── config.json            # YOUR SHORTCUTS (edit this!)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
└── README.md              # This file
```

## Customization

### Change the Omnibox Keyword

If you want to use a different keyword instead of `golink` (for autocomplete), modify `manifest.json`:

```json
"omnibox": {
  "keyword": "go"
}
```

Then type `go` + Space in the address bar for autocomplete. Note: This doesn't affect the `go/repo` direct URL method.

## Permissions Explained

- `storage`: Caches the config in local storage for fast access
- `tabs`: Required for navigating to redirect URLs (omnibox mode)
- `declarativeNetRequest`: Intercepts and redirects `go/*` URLs
- `declarativeNetRequestWithHostAccess`: Allows matching `*://go/*` pattern

## Troubleshooting

### `go/repo` doesn't redirect

1. **Reload the extension**: Go to `chrome://extensions/` and click the refresh icon
2. **Check config**: Click the extension icon to see if your links are loaded
3. **Check service worker console**:
   - Go to `chrome://extensions/`
   - Click "service worker" under the extension
   - Look for "Config loaded successfully" message
   - Check for any error messages

### Omnibox (`golink`) doesn't work

1. Make sure you press **Space** or **Tab** after typing `golink`
2. You should see "Search Go Links Redirector" appear
3. If not, reload the extension

### After editing config.json

Always reload the extension at `chrome://extensions/` to apply changes.

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## License

Free to use and modify for your needs.
