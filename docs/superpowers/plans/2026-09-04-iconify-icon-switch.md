# Iconify Icon Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Apiary's Material Symbols webfont icons with Iconify's `mdi` (Material Design Icons) set, fetched from the public Iconify API, while keeping the existing alias-map + semantic-suggestion architecture (repointed at the new set) and adding a manual search box so the larger library is actually reachable.

**Architecture:** Fixed UI-chrome glyphs (Load/Save/Export/+New/clear — 5 total) become static inline SVGs with no runtime dependency. Dynamic, runtime-chosen icons (hex icons, suggestion buttons, search results) go through a new small fetch-and-cache module (`getIconData`/`onIconCacheChange`) that mirrors the existing `iconEngineState` pattern: synchronous cache-hit lookups, async cache-miss fetches that trigger a re-render when they resolve, and localStorage persistence so repeat views need no network. `renderHex()` swaps its `<text>` ligature for a nested `<svg>` using fetched path data. The suggestion engine (`tools/`, `vendor/`, `ICON_ALIASES`) keeps its exact architecture, repointed at `mdi`.

**Tech Stack:** Vanilla JS (no build step), SVG, Iconify public API (`api.iconify.design`), Node scripts in `tools/` (unchanged toolchain: `@huggingface/transformers`, `node --test`).

**Spec:** [docs/superpowers/specs/2026-09-04-iconify-icon-switch-design.md](../specs/2026-09-04-iconify-icon-switch-design.md)

## Global Constraints

- Single icon set: `mdi` (Material Design Icons) — no mixing sets, one prefix constant.
- Public Iconify API only (`https://api.iconify.design`) — no self-hosted API, no self-hosted icon bundle.
- Icon identifiers are Iconify's canonical `"prefix:name"` form (e.g. `"mdi:handshake"`), stored in `h.icon` / `newIcon` exactly as today's bare ligature string was.
- No persistence format changes needed — icons already don't round-trip through `.bee`/CSV (confirmed in spec); do not add any.
- Every new failure path degrades the same way the existing `iconEngineState` machinery does: no icon shown, no thrown error, no retry storm.
- `demo()` / `#test` must stay network-free and fast, exactly as today. `iconDemo()` stays a manual, network-using dev-console check — it is not, and must not become, part of `demo()`.
- No new npm dependencies, no new CDN hosts beyond `api.iconify.design`.

---

### Task 1: Replace fixed UI-chrome glyphs with static inline SVG

**Files:**
- Modify: `index.html:9` (remove Material Symbols Google Fonts `<link>`)
- Modify: `index.html:10-24` (remove `.material-symbols-outlined` CSS block)
- Modify: `index.html:167` (remove now-dead `.a-toolbar-btn .material-symbols-outlined` rule)
- Modify: `index.html:514` (Load button icon)
- Modify: `index.html:519` (Save button icon)
- Modify: `index.html:523` (Export csv button icon)
- Modify: `index.html:544` (+ Add to canvas button icon)

**Interfaces:**
- Consumes: nothing (static markup only).
- Produces: nothing later tasks depend on — this is a self-contained visual swap. (The `.a-icon-clear` "×" button inside the icon picker is handled in Task 4, not here, because it lives inside `mountIconPicker`'s generated DOM rather than static HTML.)

- [ ] **Step 1: Fetch the real path data for the 5 fixed glyphs**

Run this once to get the actual `mdi` path bodies (never guess/hand-write SVG path data):

```bash
curl -s 'https://api.iconify.design/mdi.json?icons=folder-open-outline,content-save-outline,download,plus,close' | python3 -m json.tool
```

This returns JSON shaped like:

```json
{
  "prefix": "mdi",
  "icons": {
    "folder-open-outline": { "body": "<path d=\"...\"/>" },
    "content-save-outline": { "body": "<path d=\"...\"/>" },
    "download": { "body": "<path d=\"...\"/>" },
    "plus": { "body": "<path d=\"...\"/>" },
    "close": { "body": "<path d=\"...\"/>" }
  },
  "width": 24,
  "height": 24
}
```

Keep this output open — you'll paste each `body` value into Step 3.

- [ ] **Step 2: Remove the Material Symbols webfont and its CSS**

In `index.html`, delete line 9 (the `Material+Symbols+Outlined` Google Fonts `<link>`):

```diff
   <link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;1,400&family=Alegreya+Sans:wght@300;400;500&family=Alegreya+Sans+SC:wght@400;500&display=swap" rel="stylesheet">
-  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=swap" rel="stylesheet">
   <style>
-    .material-symbols-outlined {
-      font-family: 'Material Symbols Outlined';
-      font-weight: normal;
-      font-style: normal;
-      font-size: 18px;
-      line-height: 1;
-      display: inline-block;
-      white-space: nowrap;
-      word-wrap: normal;
-      direction: ltr;
-      -webkit-font-feature-settings: 'liga';
-      -webkit-font-smoothing: antialiased;
-    }
+    .a-icon { display: block; flex: none; }
   </style>
```

`.a-icon` is the new shared utility class for every inline SVG icon (chrome and dynamic) — `display:block` avoids the baseline gap inline SVGs get by default, `flex:none` stops it shrinking inside `display:inline-flex` buttons.

Then delete the now-dead rule at (originally) line 167:

```diff
-    .a-toolbar-btn .material-symbols-outlined { font-size: 18px; }
     .a-toolbar-btn:hover { opacity: 0.85; }
```

- [ ] **Step 3: Swap the 4 static toolbar/button glyphs**

Replace each `<span class="material-symbols-outlined" aria-hidden="true">NAME</span>` with `<svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">BODY</svg>`, using the `body` values from Step 1:

```diff
   <button id="btnLoad" type="button" class="a-toolbar-btn">
-    <span class="material-symbols-outlined" aria-hidden="true">file_open</span>
+    <svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><!-- paste folder-open-outline body --></svg>
     Load
   </button>
   <input id="loadFile" type="file" accept=".bee,application/json" class="sr-only" aria-label="Load .bee file" tabindex="-1" />
   <button id="btnSave" class="a-toolbar-btn">
-    <span class="material-symbols-outlined" aria-hidden="true">save</span>
+    <svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><!-- paste content-save-outline body --></svg>
     Save
   </button>
   <button id="btnExportCSV" class="a-toolbar-btn">
-    <span class="material-symbols-outlined" aria-hidden="true">download</span>
+    <svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><!-- paste download body --></svg>
     Export csv
   </button>
```

And the "+ Add to canvas" button:

```diff
   <button id="btnAddHex" type="button" class="a-btn a-btn--primary" style="width:100%;justify-content:center;margin-top:0.9rem;">
-    <span class="material-symbols-outlined" aria-hidden="true">add</span>
+    <svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><!-- paste plus body --></svg>
     Add to canvas
   </button>
```

(The `close`/clear-icon body from Step 1 is used in Task 4, not here — keep it noted for later.)

- [ ] **Step 4: Manual check**

Open `index.html` directly in a browser (or via the project's preview tooling). Confirm:
- All 4 buttons render a crisp vector glyph (not a missing-icon box, not text).
- No console errors.
- Browser network tab shows no request to `fonts.googleapis.com` for Material Symbols.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Replace fixed toolbar icons with static inline mdi SVGs"
```

---

### Task 2: Icon fetch-and-cache module

**Files:**
- Modify: `index.html` — insert new module after the `svgEl()` helper (currently `index.html:755-759`)
- Modify: `index.html` — add cache-clearing test lines inside `demo()` (currently `index.html:2072` onward)

**Interfaces:**
- Consumes: nothing (foundational module).
- Produces:
  - `ICON_PREFIX` — string constant, `'mdi'`.
  - `getIconData(key: string): {body: string, width: number, height: number} | null` — synchronous cache lookup; `null` on a cache miss (which also queues a background fetch).
  - `onIconCacheChange(cb: () => (false | void))` — registers a callback fired after a batch of icons finishes fetching (success or failure); returning `false` unsubscribes it, matching `onIconEngineChange`'s existing contract.

- [ ] **Step 1: Add the module**

Insert this immediately after the `svgEl()` function (`index.html:755-759`):

```js
// ─── Icon glyph cache (Iconify) ─────────────────────────────────────────────
// Hexagon/picker icons are stored as Iconify ids ("mdi:name"). Path data is
// fetched from the public Iconify API on first use and cached forever — SVG
// path data for a fixed icon name never changes — in memory + localStorage.
// Every icon in this app shares one prefix, so a batch fetch always shares one.
const ICON_PREFIX = 'mdi';
const _iconCache = new Map();       // "mdi:name" -> { body, width, height }
const _iconAttempted = new Set();   // "mdi:name" already fetched (success or failure) — never retried
let _iconFetchQueue = new Set();
let _iconFetchTimer = null;
let _iconCacheCbs = [];

function onIconCacheChange(cb) { _iconCacheCbs.push(cb); }

(function _hydrateIconCache() {
  try {
    const raw = localStorage.getItem('apiary_icon_cache');
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw))) { _iconCache.set(k, v); _iconAttempted.add(k); }
  } catch (e) { /* private browsing / corrupt data — start empty, not fatal */ }
})();

function _persistIconCache() {
  try { localStorage.setItem('apiary_icon_cache', JSON.stringify(Object.fromEntries(_iconCache))); }
  catch (e) { /* quota / private browsing — cache stays in-memory only for this session */ }
}

function getIconData(key) {
  if (_iconCache.has(key)) return _iconCache.get(key);
  if (!_iconAttempted.has(key)) _queueIconFetch(key);
  return null;
}

function _queueIconFetch(key) {
  _iconFetchQueue.add(key);
  clearTimeout(_iconFetchTimer);
  _iconFetchTimer = setTimeout(_flushIconFetch, 0);
}

async function _flushIconFetch() {
  const keys = [..._iconFetchQueue];
  _iconFetchQueue = new Set();
  if (!keys.length) return;
  keys.forEach(k => _iconAttempted.add(k));
  const names = keys.map(k => k.slice(k.indexOf(':') + 1));
  try {
    const res = await fetch(`https://api.iconify.design/${ICON_PREFIX}.json?icons=${names.join(',')}`);
    if (!res.ok) throw new Error('iconify fetch ' + res.status);
    const data = await res.json();
    const dw = data.width || 24, dh = data.height || 24;
    for (const name of Object.keys(data.icons || {})) {
      const ic = data.icons[name];
      _iconCache.set(ICON_PREFIX + ':' + name, { body: ic.body, width: ic.width || dw, height: ic.height || dh });
    }
    _persistIconCache();
  } catch (e) {
    console.error('icon fetch failed', e);
  }
  _iconCacheCbs = _iconCacheCbs.filter(cb => {
    try { return cb() !== false; } catch (e) { console.error(e); return true; }
  });
}
```

- [ ] **Step 2: Write the offline self-check**

Add this block inside `demo()` (`index.html:2072`), right after the existing `edgeKey` assertions (`index.html:2074-2075`), before the colour-palette test block:

```js
  // Icon cache: synchronous hit, miss-triggers-fetch-without-throwing, persistence round-trip.
  // Uses fake keys and cleans up its own queued fetch so #test stays network-free.
  {
    const fakeKey = 'mdi:__demo_fake_icon__';
    _iconCache.set(fakeKey, { body: '<path d="M0 0"/>', width: 24, height: 24 });
    ok(getIconData(fakeKey) && getIconData(fakeKey).body === '<path d="M0 0"/>', 'cached icon returns synchronously');
    _iconCache.delete(fakeKey);

    const missKey = 'mdi:__demo_uncached__';
    ok(getIconData(missKey) === null, 'uncached icon returns null (not throw) on first lookup');
    ok(_iconFetchQueue.has(missKey), 'uncached lookup queues a background fetch');
    // Cancel the queued fetch so this self-check never touches the network.
    clearTimeout(_iconFetchTimer);
    _iconFetchQueue = new Set();
    _iconAttempted.delete(missKey);

    _iconCache.set(fakeKey, { body: '<path d="M1 1"/>', width: 24, height: 24 });
    _persistIconCache();
    const stored = JSON.parse(localStorage.getItem('apiary_icon_cache'));
    ok(stored[fakeKey] && stored[fakeKey].body === '<path d="M1 1"/>', 'icon cache persists to localStorage');
    _iconCache.delete(fakeKey);
    _persistIconCache();
  }
```

- [ ] **Step 3: Run the self-check**

Open `index.html#test` in a browser and check the console.
Expected: `demo: all checks passed`, no thrown errors, and no network request to `api.iconify.design` in the Network tab.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add Iconify icon fetch-and-cache module with offline self-check"
```

---

### Task 3: Wire icon rendering on the canvas through the cache

**Files:**
- Modify: `index.html:1125-1136` (icon block inside `renderHex()`)
- Modify: `index.html` — Init section (currently around `index.html:2347`, right after `buildNewColorPicker();`)

**Interfaces:**
- Consumes: `getIconData(key)`, `onIconCacheChange(cb)` (Task 2).
- Produces: canvas hexes render real `mdi` vector icons; a global redraw is wired so a cache-miss self-heals once its fetch resolves. No new functions later tasks depend on.

- [ ] **Step 1: Replace the `<text>` ligature with a fetched SVG**

In `renderHex()`, replace lines 1125-1136:

```diff
   if (hasIcon) {
-    const ic = svgEl('text', {
-      x: h.x, y: cursorY + iconSize * 0.5,
-      'text-anchor': 'middle', 'dominant-baseline': 'central',
-      'font-family': '"Material Symbols Outlined"',
-      'font-feature-settings': "'liga'",
-      'font-size': iconSize,
-      fill: textColor,
-      'pointer-events': 'none'
-    });
-    ic.textContent = h.icon;
-    g.appendChild(ic);
+    const iconData = getIconData(h.icon);
+    if (iconData) {
+      const ic = svgEl('svg', {
+        x: h.x - iconSize / 2, y: cursorY,
+        width: iconSize, height: iconSize,
+        viewBox: `0 0 ${iconData.width} ${iconData.height}`,
+        fill: textColor,
+        'pointer-events': 'none'
+      });
+      ic.innerHTML = iconData.body;
+      g.appendChild(ic);
+    }
     cursorY += iconSize + gap;
   }
```

Note the `cursorY += iconSize + gap` stays unconditional (outside the new `if (iconData)`), so label text below it doesn't jump position between the "icon not yet cached" frame and the "icon now cached" frame — same layout math as today, just an empty gap instead of an empty glyph while loading.

- [ ] **Step 2: Redraw the canvas when a fetch completes**

In the Init section, right after `buildNewColorPicker();` (`index.html:2347`), add:

```js
// A hex's icon may not be cached on first render; redraw once fetches land.
onIconCacheChange(() => { render(); });
```

This callback never returns `false`, so it stays registered for the app's lifetime (matches the intent of the `onIconCacheChange`/`onIconEngineChange` contract — only picker-scoped callbacks unsubscribe when their DOM node is gone).

- [ ] **Step 3: Manual check**

Open the app, add a hex, give it an icon from `ICON_ALIASES` (e.g. type "trust" and click a suggestion — this will still be a Material Symbol name until Task 7; for now, temporarily set `newIcon` in the console to `'mdi:handshake'` before placing a hex, or place a hex then run `hexes[0].icon = 'mdi:handshake'; render();` in the console). Confirm:
- The icon appears on the hex within a moment of placing it (first load: network fetch + redraw).
- Reload the page with the same hex re-added — the icon appears instantly (localStorage cache hit, no network delay).
- With DevTools offline and an icon *not* previously cached, the hex renders label-only, no thrown error.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Render hex icons from the Iconify cache instead of the webfont"
```

---

### Task 4: Picker glyphs (current icon + suggestions) through the cache

**Files:**
- Modify: `index.html` — CSS block `/* ── ICON SUGGESTIONS (idon) ── */` (currently `index.html:361-371`)
- Modify: `index.html:1907-1958` (`mountIconPicker`'s `paint()` function)
- Modify: `index.html:1972` (the `onIconEngineChange` registration inside `mountIconPicker`, to also redraw on cache changes)

**Interfaces:**
- Consumes: `getIconData(key)`, `onIconCacheChange(cb)` (Task 2).
- Produces: `iconGlyphNode(fullName: string, sizePx: number): HTMLElement` — a reusable `<span>` containing either the icon's SVG (if cached) or an empty placeholder box of the same size (if not yet cached, so nothing jumps when it arrives). Used by Task 5's search results too.

- [ ] **Step 1: Update the picker CSS**

Replace the `.material-symbols-outlined`-scoped rules in the `/* ── ICON SUGGESTIONS (idon) ── */` block (`index.html:361-371`):

```diff
    .a-icon-suggestions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0.25rem 0 0.75rem; min-height: 34px; }
    .a-icon-suggestions button { appearance: none; -webkit-appearance: none; font: inherit; }
-    .a-icon-suggestions .material-symbols-outlined { font-size: 22px; padding: 5px; border-radius: 6px; cursor: pointer; color: var(--text); background: var(--bg-main); border: 1px solid transparent; }
-    .a-icon-suggestions .material-symbols-outlined:hover { border-color: var(--primary); }
-    .a-icon-suggestions .material-symbols-outlined.active { border-color: var(--primary); background: var(--bg-mid); }
-    .a-icon-suggestions .a-icon-clear { cursor: pointer; font-size: 18px; color: var(--serve); background: none; border: 1px solid transparent; padding: 5px; border-radius: 6px; }
+    .a-icon-suggestions .a-icon-glyph { display: inline-flex; align-items: center; justify-content: center; padding: 5px; border-radius: 6px; cursor: pointer; color: var(--text); background: var(--bg-main); border: 1px solid transparent; }
+    .a-icon-suggestions .a-icon-glyph:hover { border-color: var(--primary); }
+    .a-icon-suggestions .a-icon-glyph.active { border-color: var(--primary); background: var(--bg-mid); }
+    .a-icon-suggestions .a-icon-clear { cursor: pointer; color: var(--serve); background: none; border: 1px solid transparent; padding: 5px; border-radius: 6px; }
+    .a-icon-suggestions .a-icon-clear:hover { border-color: var(--serve); }
    .a-icon-suggestions .a-muted { font-size: 0.85rem; color: var(--text); opacity: 0.6; }
    .a-icon-suggest-btn { font: inherit; font-size: 0.8rem; padding: 2px 8px; border: 1px solid var(--primary); background: var(--bg-main); color: var(--primary); border-radius: 6px; cursor: pointer; }
```

(`.a-icon-clear:hover` already existed at `index.html:366` right after the rule being edited — keep it, just note it's no longer immediately adjacent to a deleted line.)

- [ ] **Step 2: Add `iconGlyphNode()` and rewrite `paint()`**

Add this helper directly above `mountIconPicker` (`index.html:1896`):

```js
// Small inline SVG (or an empty placeholder box, if not yet cached) for one
// Iconify id. Shared by the picker's current-icon slot, suggestions, and
// (Task 5) search results.
function iconGlyphNode(fullName, sizePx) {
  const holder = document.createElement('span');
  holder.className = 'a-icon-glyph-box';
  holder.style.width = holder.style.height = sizePx + 'px';
  const data = getIconData(fullName);
  if (data) {
    holder.innerHTML = `<svg class="a-icon" viewBox="0 0 ${data.width} ${data.height}" width="${sizePx}" height="${sizePx}" fill="currentColor">${data.body}</svg>`;
  }
  return holder;
}
```

Add this CSS rule right after `.a-icon-suggest-btn` (same block as Step 1):

```css
.a-icon-glyph-box { display: inline-flex; align-items: center; justify-content: center; }
```

Now rewrite `paint()` (`index.html:1907-1958`) to use it instead of `<span class="material-symbols-outlined">`:

```diff
   function paint(list) {
     wrap.innerHTML = '';
     wrap.setAttribute('aria-live', 'polite');
     const icon = opts.getIcon();
     if (icon) {
-      const cur = document.createElement('span');
-      cur.className = 'material-symbols-outlined active';
-      cur.textContent = icon; cur.title = icon;
+      const cur = document.createElement('span');
+      cur.className = 'a-icon-glyph active';
+      cur.appendChild(iconGlyphNode(icon, 22));
+      cur.title = icon;
       cur.setAttribute('aria-label', 'Current icon: ' + icon);
       cur.setAttribute('role', 'img');
       wrap.appendChild(cur);
       const x = document.createElement('button');
       x.type = 'button';
-      x.className = 'material-symbols-outlined a-icon-clear';
-      x.textContent = 'close';
+      x.className = 'a-icon-clear';
+      x.innerHTML = '<svg class="a-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><!-- paste close body from Task 1 Step 1 --></svg>';
       x.setAttribute('aria-label', 'Remove icon');
       x.addEventListener('click', () => choose(null));
       wrap.appendChild(x);
     }
     if (iconEngineState === 'loading') {
       const s = document.createElement('span');
       s.className = 'a-muted'; s.textContent = 'loading suggestions…';
       wrap.appendChild(s); return;
     }
     if (iconEngineState === 'failed') {
       const s = document.createElement('span');
       s.className = 'a-muted'; s.textContent = 'icon suggestions unavailable — needs an internet connection the first time';
       wrap.appendChild(s); return;
     }
     (list || []).forEach(name => {
       if (name === icon) return;
-      const g = document.createElement('button');
+      const g = document.createElement('button');
       g.type = 'button';
-      g.className = 'material-symbols-outlined';
-      g.textContent = name;
+      g.className = 'a-icon-glyph';
+      g.appendChild(iconGlyphNode(name, 22));
       g.setAttribute('aria-label', 'Use icon: ' + name);
       g.addEventListener('click', () => choose(name));
       wrap.appendChild(g);
     });
```

(The `if (!list || !list.length) { ... }` tail below this — "no strong match" / "Suggest icon" button — is unchanged.)

- [ ] **Step 3: Redraw the picker when icon glyphs finish loading**

`mountIconPicker` already tracks the last list implicitly through `suggest()`'s closure — but `paint(null)` (used by the existing `onIconEngineChange` callback at `index.html:1972`) intentionally shows no suggestions, which is correct for engine-state changes (nothing has been suggested yet at that point). For icon-cache changes we need to redraw with the *last real* suggestion list so in-flight glyph fetches can resolve visually. Add a `lastList` variable to the closure and update `suggest()` and the callback registration:

```diff
 function mountIconPicker(wrap, opts) {
   let reqToken = 0;
   let ran = false; // has a suggest request completed for the current label?
+  let lastList = null; // most recent list passed to paint(), so cache updates can redraw it
   const alive = () => document.body.contains(wrap);
```

```diff
   function paint(list) {
+    lastList = list;
     wrap.innerHTML = '';
```

```diff
   async function suggest() {
     const token = ++reqToken;
     const label = opts.getLabel();
     ran = false;
     paint(null);
     const list = await suggestIcons(label);
     if (token !== reqToken || !alive() || opts.getLabel() !== label) return;
     ran = true;
     paint(list);
   }

   onIconEngineChange(() => { if (!alive()) return false; paint(null); });
+  onIconCacheChange(() => { if (!alive()) return false; paint(lastList); });
   paint(null);
   return { suggest, paint };
 }
```

- [ ] **Step 4: Manual check**

Open the app, click into a hexagon label, click "Suggest icon". Confirm the suggestion buttons show real vector glyphs (once fetched — a brief blank box is fine on first load), clicking one sets it as the current icon (also rendered as a real glyph with the clear "×" button next to it), and clicking "×" clears it back to the "Suggest icon" state.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Render icon picker glyphs from the Iconify cache"
```

---

### Task 5: Manual icon search in the picker

**Files:**
- Modify: `index.html` — CSS block `/* ── ICON SUGGESTIONS (idon) ── */`
- Modify: `index.html` — `mountIconPicker` (`index.html:1896` onward)

**Interfaces:**
- Consumes: `iconGlyphNode()`, `getIconData()`, `onIconCacheChange()` (Task 2 & 4), the picker's existing `choose(name)` closure function.
- Produces: nothing later tasks depend on — this is the last picker-facing feature.

- [ ] **Step 1: Add search CSS**

Append to the `/* ── ICON SUGGESTIONS (idon) ── */` block:

```css
.a-icon-search { display: flex; gap: 6px; margin: 0.35rem 0; }
.a-icon-search input { flex: 1; }
.a-icon-search-results { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 2: Add the search box and results grid to `mountIconPicker`**

Add this inside `mountIconPicker`, after the `let lastList = null;` line from Task 4:

```js
  let lastSearchResults = null; // null = not searched yet, 'loading'/'failed', or an array of ids
  let searchToken = 0;

  const searchRow = document.createElement('div');
  searchRow.className = 'a-icon-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search all icons…';
  searchInput.setAttribute('aria-label', 'Search icon library');
  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'a-icon-suggest-btn';
  searchBtn.textContent = 'Search';
  searchRow.append(searchInput, searchBtn);
  const searchResults = document.createElement('div');
  searchResults.className = 'a-icon-search-results';

  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) { lastSearchResults = null; paintSearch(); return; }
    const token = ++searchToken;
    lastSearchResults = 'loading';
    paintSearch();
    let ids;
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&prefix=${ICON_PREFIX}&limit=32`);
      if (!res.ok) throw new Error('icon search ' + res.status);
      const data = await res.json();
      ids = data.icons || [];
    } catch (e) {
      console.error('icon search failed', e);
      if (token === searchToken) { lastSearchResults = 'failed'; paintSearch(); }
      return;
    }
    if (token !== searchToken || !alive()) return;
    lastSearchResults = ids;
    paintSearch();
  }

  function paintSearch() {
    searchResults.innerHTML = '';
    if (lastSearchResults === 'loading') {
      const s = document.createElement('span');
      s.className = 'a-muted'; s.textContent = 'searching…';
      searchResults.appendChild(s); return;
    }
    if (lastSearchResults === 'failed') {
      const s = document.createElement('span');
      s.className = 'a-muted'; s.textContent = 'search unavailable — check your connection';
      searchResults.appendChild(s); return;
    }
    if (!lastSearchResults) return;
    if (!lastSearchResults.length) {
      const s = document.createElement('span');
      s.className = 'a-muted'; s.textContent = 'no icons found';
      searchResults.appendChild(s); return;
    }
    lastSearchResults.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'a-icon-glyph';
      b.appendChild(iconGlyphNode(id, 22));
      b.setAttribute('aria-label', 'Use icon: ' + id);
      b.addEventListener('click', () => choose(id));
      searchResults.appendChild(b);
    });
  }

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
```

- [ ] **Step 3: Mount the search UI and redraw it on cache updates**

Update the end of `mountIconPicker` to append the new elements and repaint search results when icon glyphs finish loading:

```diff
   onIconEngineChange(() => { if (!alive()) return false; paint(null); });
-  onIconCacheChange(() => { if (!alive()) return false; paint(lastList); });
+  onIconCacheChange(() => { if (!alive()) return false; paint(lastList); paintSearch(); });
   paint(null);
+  wrap.after(searchRow, searchResults);
   return { suggest, paint };
```

(`wrap.after(...)` places the search box and results grid directly below the existing suggestions row, inside the same picker container.)

- [ ] **Step 4: Manual check**

Open the app, open a hex's editor, type "clock" into the new search box, press Enter or click Search. Confirm a grid of real clock-related `mdi` glyphs appears, and clicking one sets it as the hex's icon. Try a nonsense query ("zzqqxx") and confirm "no icons found" instead of an error.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add manual icon search to the icon picker"
```

---

### Task 6: Regenerate the suggestion corpus against `mdi`

**Files:**
- Modify: `tools/fetch-icon-catalog.mjs`
- Modify: `tools/test-fetch-icon-catalog.mjs`
- Modify: `tools/fixtures/icons-sample.json`
- Regenerate: `vendor/icon-names.json`, `vendor/icon-vectors.bin`
- Modify: `vendor/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `vendor/icon-names.json` whose `names` array contains `"mdi:name"`-prefixed strings (consumed by `suggestIcons()`, unchanged, and by Task 7's `iconDemo()` alias validation).

- [ ] **Step 1: Repoint the catalog fetcher at Iconify's `mdi` collection**

Replace `tools/fetch-icon-catalog.mjs` in full:

```js
import { writeFileSync, mkdirSync } from 'node:fs';

const ENDPOINT = 'https://api.iconify.design/collection?prefix=mdi';

// Iconify's collection endpoint returns plain JSON (no XSSI guard, unlike
// Google's old endpoint) shaped as:
//   { prefix, categories: { "Category Name": ["icon-name", ...] }, uncategorized: [...] }
export function parseMetadata(text) {
  return JSON.parse(text);
}

function humanize(name) {
  return name.replace(/-/g, ' ');
}

export function buildCatalog(metadata) {
  const categoryOf = new Map();
  for (const [category, names] of Object.entries(metadata.categories || {})) {
    for (const name of names) categoryOf.set(name, category);
  }
  const all = [
    ...Object.values(metadata.categories || {}).flat(),
    ...(metadata.uncategorized || []),
  ];
  const seen = new Set();
  const rows = [];
  for (const name of all) {
    if (seen.has(name)) continue;
    seen.add(name);
    // Repeat the humanized name so the mean-pooled embedding leans toward the
    // icon's actual meaning rather than diluting it with the category alone.
    const h = humanize(name);
    const doc = [h, h, h, categoryOf.get(name) || ''].join('. ');
    rows.push({ name: `mdi:${name}`, doc });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: rows.map((r) => r.name), docs: rows.map((r) => r.doc) };
}

async function main() {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
  const catalog = buildCatalog(parseMetadata(await res.text()));
  if (catalog.names.length < 1000) {
    throw new Error(`icon catalog too small (${catalog.names.length}) — endpoint response likely broken`);
  }
  mkdirSync(new URL('./build/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('./build/icon-catalog.json', import.meta.url),
    JSON.stringify(catalog),
  );
  console.log(`wrote ${catalog.names.length} icons to build/icon-catalog.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Update the fixture and test to match the new source shape**

Replace `tools/fixtures/icons-sample.json`:

```json
{
  "categories": {
    "Action": ["delete", "cash", "trash-can-outline"],
    "Social": ["account-group", "check-decagram"],
    "Home": ["home"],
    "Alert": ["alert"]
  },
  "uncategorized": ["blank-icon-example"]
}
```

Replace `tools/test-fetch-icon-catalog.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMetadata, buildCatalog } from './fetch-icon-catalog.mjs';

const RAW = readFileSync(new URL('./fixtures/icons-sample.json', import.meta.url), 'utf8');

test('parseMetadata returns the collection JSON as-is', () => {
  const md = parseMetadata(RAW);
  assert.ok(md.categories);
  assert.ok(Array.isArray(md.categories.Action));
});

test('buildCatalog prefixes names with mdi:, humanizes hyphens, dedupes, sorts', () => {
  const { names, docs } = buildCatalog(parseMetadata(RAW));
  assert.ok(names.includes('mdi:delete'), 'category icon should be kept and prefixed');
  assert.ok(names.includes('mdi:blank-icon-example'), 'uncategorized icon should be kept too');
  assert.equal(names.length, docs.length);
  assert.equal(names.length, 6, 'all 6 sample icons kept, none dropped');
  const i = names.indexOf('mdi:trash-can-outline');
  assert.match(docs[i], /^trash can outline\. trash can outline\. trash can outline\. Action$/, 'hyphens humanized, name repeated, category appended');
  // sorted, unique
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
});
```

- [ ] **Step 3: Run the tool tests**

```bash
cd tools && npm test
```

Expected: both tests pass.

- [ ] **Step 4: Regenerate the real corpus**

```bash
cd tools && npm install && npm run catalog && npm run build
```

Expected: `wrote N icons to build/icon-catalog.json` (N should be roughly 7,000+ for `mdi`), then `wrote vendor/icon-vectors.bin (...) + icon-names.json`. This takes a few minutes (downloads the MiniLM model once, embeds every icon name).

- [ ] **Step 5: Update `vendor/README.md`**

```diff
-Generated assets for the semantic icon-suggestion feature (see `docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md`).
+Generated assets for the semantic icon-suggestion feature (see
+`docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md` for the
+original design and `docs/superpowers/specs/2026-09-04-iconify-icon-switch-design.md`
+for the switch to the `mdi` icon set).
```

```diff
 | File | What | Regenerate |
 |---|---|---|
-| `icon-names.json` | Corpus metadata: `{model, dim, count, scale, names[]}` | `cd tools && npm install && npm run catalog && npm run build` |
+| `icon-names.json` | Corpus metadata: `{model, dim, count, scale, names[]}`. Names are Iconify ids (`"mdi:name"`). | `cd tools && npm install && npm run catalog && npm run build` |
 | `icon-vectors.bin` | icon embeddings, int8 quantized (`count` × `dim` bytes) | same |
```

- [ ] **Step 6: Commit**

```bash
git add -f tools/fetch-icon-catalog.mjs tools/test-fetch-icon-catalog.mjs tools/fixtures/icons-sample.json vendor/icon-names.json vendor/icon-vectors.bin vendor/README.md
git commit -m "Regenerate icon-suggestion corpus against the mdi icon set"
```

(`git add -f` because `vendor/` may be gitignored-but-tracked in this repo — check with `git check-ignore vendor/icon-names.json` first; if it prints nothing, plain `git add` is enough.)

---

### Task 7: Remap `ICON_ALIASES` to `mdi`

**Files:**
- Create: `tools/suggest-alias-candidates.mjs`
- Modify: `index.html:1831-1882` (`ICON_ALIASES`)

**Interfaces:**
- Consumes: nothing from earlier tasks directly (uses the live Iconify search API, not the regenerated corpus).
- Produces: `ICON_ALIASES` with every value replaced by real `mdi:name` ids, consumed by Task 8's validation.

This is a content-curation task, not a mechanical one: `mdi`'s hyphenated names have no 1:1 mapping from Material Symbols' `snake_case` names, so every one of the ~150 entries needs a human (or an agent with live web access) to pick the best replacement. The script below turns "search Iconify's site 150 times by hand" into "review one generated file."

- [ ] **Step 1: Write the candidate-suggestion script**

Create `tools/suggest-alias-candidates.mjs`:

```js
import { writeFileSync } from 'node:fs';

// Keep this list in sync with the *keys* of ICON_ALIASES in index.html —
// it's duplicated here deliberately (a Node script has no access to the
// browser-global object literal in index.html without a parser dependency,
// and this list is short-lived scaffolding, not a maintained data file).
const TERMS = [
  'trust', 'relationship', 'partnership', 'collaboration', 'cooperation',
  'reciprocity', 'mutual benefit', 'respect', 'communication', 'listening',
  'dialogue', 'conversation', 'conflict', 'tension', 'repair', 'power',
  'power dynamics', 'power sharing', 'equity', 'inequity', 'equality',
  'inequality', 'justice', 'injustice', 'oppression', 'privilege',
  'inclusion', 'exclusion', 'marginalization', 'representation', 'voice',
  'empowerment', 'advocacy', 'social change', 'liberation', 'knowledge',
  'know', 'knowing', 'understand', 'understanding', 'insight', 'learning',
  'learn', 'education', 'teaching', 'expertise', 'lived experience',
  'wisdom', 'research', 'data', 'evidence', 'inquiry', 'question',
  'questions', 'reflection', 'reflexivity', 'curiosity', 'storytelling',
  'narrative', 'ethics', 'ethical', 'values', 'integrity', 'consent',
  'confidentiality', 'privacy', 'harm', 'do no harm', 'safety', 'care',
  'dignity', 'humility', 'fairness', 'community', 'community member',
  'stakeholder', 'staff', 'researcher', 'participant', 'coalition',
  'network', 'neighborhood', 'belonging', 'culture', 'identity', 'youth',
  'elders', 'planning', 'facilitation', 'decision', 'decision making',
  'action', 'implementation', 'evaluation', 'assessment', 'outcomes',
  'impact', 'sustainability', 'capacity building', 'capacity', 'resources',
  'funding', 'grant', 'budget', 'time', 'meeting', 'training', 'onboarding',
  'feedback', 'accountability', 'transparency', 'fear', 'hope',
  'frustration', 'joy', 'burnout', 'resilience', 'healing', 'grief',
  'stress', 'wellbeing', 'trauma', 'system', 'structure', 'policy',
  'institution', 'government', 'university', 'bureaucracy', 'barrier',
  'access', 'accessibility', 'infrastructure', 'social determinants',
  'support', 'institutional support', 'peer support',
];

async function main() {
  const out = {};
  for (const term of TERMS) {
    const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(term)}&prefix=mdi&limit=8`);
    if (!res.ok) { console.error(`search failed for "${term}": ${res.status}`); out[term] = []; continue; }
    const data = await res.json();
    out[term] = data.icons || [];
    console.log(term.padEnd(24), '→', (data.icons || []).join(', '));
    await new Promise(r => setTimeout(r, 100)); // be polite to the free public API
  }
  writeFileSync(new URL('./build/alias-candidates.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('\nwrote tools/build/alias-candidates.json');
}

main();
```

- [ ] **Step 2: Run it**

```bash
cd tools && node suggest-alias-candidates.mjs
```

This prints every term with up to 8 keyword-search candidates, and writes the same data to `tools/build/alias-candidates.json` for reference while editing.

- [ ] **Step 3: Rewrite `ICON_ALIASES`**

For every term, pick the best 2 candidates from `tools/build/alias-candidates.json` (falling back to your own judgment / manually browsing `https://icon-sets.iconify.design/mdi/` for a term with poor search results — free-text search doesn't always surface the best abstract match). Replace `index.html:1831-1882` with the same structure, same keys, `mdi:`-prefixed values:

```js
const ICON_ALIASES = {
  trust: ['mdi:handshake-outline', 'mdi:shield-check-outline'],
  relationship: ['mdi:account-multiple-outline', 'mdi:handshake-outline'],
  // ... continue for every existing key, using your picks from Step 2 ...
};
```

Keep every existing key exactly as-is (including the multi-word quoted keys like `'power dynamics'`) — only the values change. Do not add or remove keys in this task.

- [ ] **Step 4: Delete the scaffolding script**

```bash
rm tools/suggest-alias-candidates.mjs tools/build/alias-candidates.json
```

It served its purpose for this one-time remap; keeping it around invites it to silently drift out of sync with `ICON_ALIASES`'s real keys.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Remap ICON_ALIASES from Material Symbols to mdi icon names"
```

---

### Task 8: Fix `iconDemo()` for the new corpus and aliases

**Files:**
- Modify: `index.html:2042-2069` (`iconDemo()`)

**Interfaces:**
- Consumes: the regenerated `vendor/icon-names.json` (Task 6) and remapped `ICON_ALIASES` (Task 7), via the existing `suggestIcons()`/`_iconEngine` machinery (unchanged).
- Produces: nothing later tasks depend on — this is the last suggestion-engine task.

`iconDemo()` is a manual, network-using dev-console check (it is deliberately not called from `demo()`/`#test` — see Global Constraints). Its two hardcoded expectations were written against Material Symbols names and will no longer match `mdi`'s naming.

- [ ] **Step 1: Loosen the generic-term regexes**

The `cases` array (`index.html:2043-2049`) checks that generic English words ("money", "team", "warning") land on a semantically related icon. The exact icon *name* mdi uses for a concept can't be predicted without running the embedding, so make these regexes concept-tolerant instead of naming an exact icon:

```diff
   const cases = [
-    ['money', /payment|money|cash|wallet|savings|attach_money/],
-    ['team', /group|people|diversity/],
-    ['warning', /warning|report|error|priority_high/],
+    ['money', /cash|money|wallet|currency|bank|payment/],
+    ['team', /account.?group|people|team/],
+    ['warning', /alert|warning|exclamation/],
     ['', null],
     ['qwertyuiop asdfghjkl', null], // gibberish → nothing clears the floor
   ];
```

- [ ] **Step 2: Run `iconDemo()` and observe real output**

Open the app in a browser (with the corpus from Task 6 and aliases from Task 7 in place), open the console, run:

```js
await iconDemo()
```

- [ ] **Step 3: Fix whatever the run reveals**

Two things can legitimately fail here and both are fixable only by looking at real output, not by guessing in advance:

1. **A `cases` regex still doesn't match.** Read the console's printed actual suggestions for that term and widen the regex to match what `mdi` actually calls it.
2. **The alias short-circuit assertion.** `index.html`'s current line is:
   ```js
   const eth = await suggestIcons('Ethics');
   console.assert(eth.join() === 'balance,gavel', `alias short-circuit failed: ${eth}`);
   ```
   Update the expected string to the exact two values your Task 7 remap put on `ICON_ALIASES.ethics`:
   ```js
   const eth = await suggestIcons('Ethics');
   console.assert(eth.join() === '<paste ICON_ALIASES.ethics.join(",") here>', `alias short-circuit failed: ${eth}`);
   ```

- [ ] **Step 4: Re-run until clean**

```js
await iconDemo()
```

Expected: every case logs `PASS`, ending with `iconDemo: alias checks done`, no `console.error`/`console.assert` failures.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Update iconDemo() expectations for the mdi corpus and aliases"
```

---

### Task 9: Docs and final manual QA

**Files:**
- Modify: `CLAUDE.md` (Tech Stack → Dependencies line)

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: nothing — this is the closing task.

- [ ] **Step 1: Update `CLAUDE.md`**

Replace the Dependencies line in the Tech Stack section:

```diff
-- **Dependencies**: Google Fonts (`Alegreya`, `Alegreya Sans`, `Alegreya Sans SC`, `Material Symbols Outlined`). No JavaScript libraries in the core app. The **optional** icon-suggestion feature (`suggestIcons` / `_loadIconEngine`) lazy-loads `@huggingface/transformers` from the jsdelivr CDN plus the local `vendor/icon-*.{json,bin}` corpus on first use; it fails closed (`iconEngineState = 'failed'`) with no network and blocks nothing else.
+- **Dependencies**: Google Fonts (`Alegreya`, `Alegreya Sans`, `Alegreya Sans SC`). No JavaScript libraries in the core app. Hexagon and picker icons come from the `mdi` (Material Design Icons) set via the public [Iconify API](https://iconify.design/docs/api/) (`api.iconify.design`) — fetched on demand and cached in `localStorage`/memory (`getIconData`/`onIconCacheChange`); an uncached icon with no network renders label-only, no error. Five fixed UI-chrome glyphs are static inline SVG with no runtime dependency. The **optional** icon-suggestion feature (`suggestIcons` / `_loadIconEngine`) lazy-loads `@huggingface/transformers` from the jsdelivr CDN plus the local `vendor/icon-*.{json,bin}` corpus (embedded against the `mdi` catalog) on first use; it fails closed (`iconEngineState = 'failed'`) with no network and blocks nothing else.
```

- [ ] **Step 2: Full manual QA pass**

Walk through the spec's testing scenarios end to end in a real browser:

1. Place a hex, type "trust" as its label, click "Suggest icon" — confirm it resolves to a sensible `mdi` icon (one of your Task 7 picks).
2. Use the new search box with a term outside the alias map (e.g. "bicycle") — confirm a grid of real glyphs appears and picking one sets the hex's icon.
3. Reload the page (icons placed this session are gone — no persistence, as documented — so re-place the same hexes) and confirm previously-fetched icons for those exact names render instantly from cache (Network tab shows no request for them).
4. With DevTools set to offline, place a hex and try an icon name never fetched before this session — confirm it renders label-only with no thrown error and no infinite retry (check the Network tab shows exactly one failed request for it, not a stream of retries on every re-render/drag).
5. Confirm all 5 static chrome glyphs (Load, Save, Export csv, +Add to canvas, the picker's clear "×") still render correctly and the Network tab shows no `fonts.googleapis.com` request for Material Symbols.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for the Iconify icon switch"
```
