# Zotero Plugin Development — Design Document

This file is the master design reference for all Zotero plugins in this project.
**Usage:** Copy this file to each plugin's project folder and use it as the basis for development.
Two plugin projects will be created from this document:
- `zotero-price-lookup` — fetch book prices by ISBN
- `zotero-rvk-classifier` — predict RVK notations via LLM

---

## Each Plugin's Project Structure

Each plugin lives in its own project folder with this structure:

```
zotero-[plugin-name]/
├── src/
│   └── index.ts          ← main plugin logic
├── addon/
│   └── content/
│       └── icons/        ← plugin icons (SVG/PNG)
├── locale/
│   └── en-US/
│       └── plugin.ftl    ← Fluent localization strings
├── manifest.json
├── bootstrap.js
├── prefs.js
├── package.json
└── CLAUDE.md             ← this file (copied here)
```

No monorepo. Each plugin is self-contained.

---

## Zotero 7 Plugin Architecture

### manifest.json

```json
{
  "manifest_version": 2,
  "name": "Plugin Display Name",
  "version": "1.0.0",
  "description": "Short description",
  "author": "Author Name",
  "applications": {
    "zotero": {
      "id": "plugin-id@example.org",
      "strict_min_version": "7.0",
      "strict_max_version": "7.0.*",
      "update_url": "https://example.com/update.json"
    }
  }
}
```

- `update_url` is **required** from Zotero 7.0.15+. Use a placeholder for development.
- Plugin ID must be unique (email-style format).

### bootstrap.js — Lifecycle

```javascript
var addon;

function startup({ id, version, rootURI }, reason) {
  Services.scriptloader.loadSubScript(`${rootURI}src/index.js`);
  addon = new ZoteroPlugin(rootURI);
  addon.startup();
}

function shutdown({ id, version, rootURI }, reason) {
  addon?.shutdown();
  addon = undefined;
  // CRITICAL: Zotero 7 supports disable without restart.
  // All DOM changes, observers, menu registrations, pref observers MUST be cleaned up.
}

function install(data, reason) {}
function uninstall(data, reason) {}

function onMainWindowLoad(win) {
  addon?.onMainWindowLoad(win);
}

function onMainWindowUnload(win) {
  addon?.onMainWindowUnload(win);
}
```

### prefs.js — Default Preferences

```javascript
pref("extensions.plugin-id.setting1", "default-value");
pref("extensions.plugin-id.apiKey", "");
```

---

## Key Zotero APIs

### Get Selected Items

```javascript
const items = Zotero.getActiveZoteroPane().getSelectedItems();
const books = items.filter(item => item.itemType === 'book');
```

### Read / Write Extra Field

Custom plugin data is stored in the Extra field as `key: value` pairs (one per line).

```javascript
// Read
function getExtraField(item, key) {
  const extra = item.getField('extra') || '';
  const match = extra.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

// Write (preserves other keys)
function setExtraField(item, key, value) {
  let extra = item.getField('extra') || '';
  const line = `${key}: ${value}`;
  const regex = new RegExp(`^${key}:.*$`, 'm');
  extra = regex.test(extra) ? extra.replace(regex, line) : (extra ? `${extra}\n${line}` : line);
  item.setField('extra', extra);
}

// Save
await item.saveTx();
// OR inside Zotero.DB.executeTransaction(): item.save();
```

### Preferences

```javascript
// Third arg true = global (full key with "extensions." prefix)
const val = Zotero.Prefs.get('extensions.plugin-id.myKey', true);
Zotero.Prefs.set('extensions.plugin-id.myKey', 'value', true);

// Observer (unregister in shutdown)
const obsID = Zotero.Prefs.registerObserver('extensions.plugin-id.myKey', newVal => {}, true);
Zotero.Prefs.unregisterObserver(obsID);
```

### Context Menu Registration

```javascript
// Call in onMainWindowLoad(win)
Zotero.MenuManager.registerMenu({
  menuID: 'plugin-id-action',
  pluginID: 'plugin-id@example.org',
  target: 'main/library/item',   // right-click on items in library
  menus: [{
    menuType: 'menuitem',
    l10nID: 'plugin-id-menu-label',  // defined in .ftl file
    icon: 'chrome://plugin-id/content/icons/icon.svg',
    onCommand: (event, context) => {
      // context.items = selected items
    }
  }]
});
```

### Progress Notification

```javascript
const win = new Zotero.ProgressWindow({ closeOnClick: true });
win.changeHeadline('Plugin Name');
win.addLines(['Processing...'], ['']);
win.startCloseTimer(3000);
win.show();
```

### HTTP Fetch (inside Zotero plugin context)

```javascript
async function fetchJSON(url, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
```

---


## Plugin 1: zotero-price-lookup

### Purpose
Look up book prices by ISBN via OpenBD API and write the result to the `Price` key
in each item's Extra field.

### Trigger
Right-click context menu on selected book items: **"Look up price"**

### API: OpenBD

OpenBD is a free Japanese book bibliographic API requiring no API key.
Spec: https://openbd.jp/spec/
Expected availability: until approximately 2028 (may change after that).

**Endpoint:**
```
GET https://api.openbd.jp/v1/get?isbn={ISBN}
```

**Example:**
```
https://api.openbd.jp/v1/get?isbn=978-4-7808-0204-7
```

**Response structure** (array of one object or `[null]` if not found):
```json
[
  {
    "onix": {
      "ProductSupply": {
        "SupplyDetail": {
          "Price": [
            {
              "PriceType": "01",      // "01" = retail price
              "PriceAmount": "1300",  // price as string
              "CurrencyCode": "JPY"
            }
          ]
        }
      }
    },
    "hanmoto": { ... },   // Japanese publisher-specific data
    "summary": { ... }    // simplified metadata snapshot
  }
]
```

**Price extraction:**
```javascript
// Returns null if not found; response[0] is null if ISBN unknown
const price = response[0]
  ?.onix?.ProductSupply?.SupplyDetail?.Price?.[0];
// price.PriceAmount → e.g. "1300"
// price.CurrencyCode → e.g. "JPY"
```

**Notes:**
- Response is an array; `response[0]` is `null` if the ISBN is not in the database.
- `PriceType "01"` = retail price. Other types may also be present.
- Currency is almost always `JPY` (Japanese books only).
- No API key required. No documented rate limit, but be reasonable.

### Preferences

| Key | Default | Description |
|-----|---------|-------------|
| `extensions.zotero-price-lookup.currency` | `"JPY"` | Preferred currency code (for display) |

### Extra Field Result

```
Price: ¥1,300
```

### Processing Flow

```
1. Get selected items, filter to books
2. For each item:
   a. Extract ISBN (getField('ISBN'), normalize hyphens)
   b. Skip if no ISBN → log to notification
   c. GET https://api.openbd.jp/v1/get?isbn={ISBN}
   d. If response[0] is null → "not found" in notification
   e. Extract response[0].onix.ProductSupply.SupplyDetail.Price[0]
   f. Format: `¥${Number(PriceAmount).toLocaleString()}`
   g. setExtraField(item, 'Price', formattedPrice)
   h. await item.saveTx()
3. Show summary notification (found N / skipped M)
```

---

## Development Workflow

### Recommended Build Setup

Use the official template as starting point:
https://github.com/zotero/zotero-plugin-template

```bash
npm install
npm run build        # TypeScript → JS, bundle with esbuild
npm run build:watch  # watch mode
npm run zip          # package as .xpi
```

### Install in Zotero for Development

1. Build the plugin (`npm run build`)
2. Zotero → Tools → Add-ons → Install Add-on from File → select `.xpi`
3. Or use the template's built-in hot-reload support

### Optional: zotero-plugin-toolkit

For complex UI needs (tables, dialogs, etc.):
```bash
npm install zotero-plugin-toolkit
```
Key modules: `ExtraFieldTool`, `ProgressWindowHelper`, `DialogHelper`, `MenuManager`

### TypeScript

- Add Zotero types from the template's `typings/` directory
- Target: `ES2020`
