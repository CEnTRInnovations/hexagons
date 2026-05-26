# CEnTR*CANON CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Apiary's node-list CSV export with a CEnTR*CANON-compliant undirected edge list, and add a composite slug input to drive the export filename.

**Architecture:** All changes are confined to `index.html` (single-file SPA, no build system). The existing `getAdjacent()` function already computes the correct adjacency pairs — the work is (1) adding a slug `<input>` to the Data panel, (2) adding an RFC 4180 quoting helper, and (3) replacing the `btnExportCSV` click handler with an edge-list emitter. The button label also changes to "Export to CEnTR*CANON".

**Tech Stack:** Vanilla JavaScript, SVG, CSS custom properties — no build step, no dependencies. Verification is manual (open in browser).

---

## File Map

| File | Change |
|---|---|
| `index.html` (line ~350) | Add `<label>` + `<input id="slugInput">` above button row in Data panel |
| `index.html` (line ~350) | Rename button label from `Export CSV` → `Export to CEnTR*CANON` |
| `index.html` (line ~757) | Add `csvField()` RFC 4180 quoting helper |
| `index.html` (line ~757) | Replace `btnExportCSV` click handler with edge-list exporter |

---

## Task 1: Add composite slug input to the Data panel

**Files:**
- Modify: `index.html` lines 344–351 (Data section, inside the `<div>` that holds `.a-btn-row`)

### Context

The current Data section HTML (around line 344) looks like this:

```html
<!-- Data -->
<div>
  <div class="a-section-title">Data</div>
  <div class="a-section-stripe" style="background:var(--secondary)"></div>
  <div class="a-btn-row">
    <label class="a-btn" style="cursor:pointer;">
      <input id="importJSON" type="file" accept="application/json" style="display:none" />
      Import JSON
    </label>
    <button id="btnExportJSON" class="a-btn">Export JSON</button>
    <button id="btnExportCSV" class="a-btn">Export CSV</button>
  </div>
</div>
```

- [ ] **Step 1: Insert slug label and input above the button row, and rename the CSV button**

Replace the Data `<div>` block (lines ~341–352) with:

```html
<!-- Data -->
<div>
  <div class="a-section-title">Data</div>
  <div class="a-section-stripe" style="background:var(--secondary)"></div>
  <label class="a-label" for="slugInput">Composite slug</label>
  <input id="slugInput" type="text" placeholder="e.g. student-advisory-board" style="margin-bottom:0.75rem" />
  <div class="a-btn-row">
    <label class="a-btn" style="cursor:pointer;">
      <input id="importJSON" type="file" accept="application/json" style="display:none" />
      Import JSON
    </label>
    <button id="btnExportJSON" class="a-btn">Export JSON</button>
    <button id="btnExportCSV" class="a-btn">Export to CEnTR*CANON</button>
  </div>
</div>
```

- [ ] **Step 2: Verify the input renders correctly**

Open `index.html` in a browser (double-click the file or use a local server). Confirm:
- A labelled text input reading "Composite slug" appears above the three buttons in the Data panel.
- The placeholder text `e.g. student-advisory-board` is visible.
- The button previously labelled "Export CSV" now reads "Export to CEnTR*CANON".
- The input uses the design system's parchment background and `--primary` focus ring (inherits from `input[type="text"]` global styles defined around line 126).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add composite slug input to Data panel; rename CSV export button"
```

---

## Task 2: Add RFC 4180 helper and replace the CSV export handler

**Files:**
- Modify: `index.html` lines 750–761 (Export/Import section)

### Context

The current export handler (around line 757) emits a **node list**:

```js
document.getElementById('btnExportCSV').addEventListener('click', () => {
  const rows = [['id','text','color','x','y','size']];
  hexes.forEach(h => rows.push([h.id, `"${(h.text||'').replace(/"/g,'""')}"`, h.color, Math.round(h.x), Math.round(h.y), h.size]));
  dl(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), 'apiary.csv');
});
```

This must be replaced with an **edge-list** emitter that:
1. Reads the slug input and formats the filename as `{slug}_{YYYY-MM-DD}.csv`.
2. Calls `getAdjacent()` to get `[hexId, hexId]` pairs.
3. Resolves each ID to the hex's `.text` label.
4. Skips pairs where either label is empty or both labels are identical (self-loop).
5. Applies RFC 4180 quoting: only wraps a field in double-quotes if it contains a comma, double-quote, or newline character.
6. Emits only `from,to` columns (no `weight`/`polarity` — `mod_gather` will impute defaults and assign `NO WEIGHT` + `NO POLARITY` status, which is non-blocking).

`getAdjacent()` is defined around line 455 and returns an array of `[hexA.id, hexB.id]` number pairs. The `hexes` global array holds the full hex objects.

- [ ] **Step 1: Add the `csvField` helper function**

Locate the `// ─── Export / Import ───` comment block (around line 750). Insert the helper **before** the existing `dl()` function definition:

```js
// ─── Export / Import ──────────────────────────────────────────────────────────
function csvField(str) {
  const s = String(str || '');
  return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}
function dl(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
```

(The existing `// ─── Export / Import ───` comment line stays; only `csvField` is new above `dl`.)

- [ ] **Step 2: Replace the `btnExportCSV` click handler**

Find and replace the existing handler (lines ~757–761):

```js
// REMOVE THIS:
document.getElementById('btnExportCSV').addEventListener('click', () => {
  const rows = [['id','text','color','x','y','size']];
  hexes.forEach(h => rows.push([h.id, `"${(h.text||'').replace(/"/g,'""')}"`, h.color, Math.round(h.x), Math.round(h.y), h.size]));
  dl(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), 'apiary.csv');
});
```

Replace with:

```js
document.getElementById('btnExportCSV').addEventListener('click', () => {
  const rawSlug = document.getElementById('slugInput').value.trim();
  const slug = rawSlug ? rawSlug.replace(/\s+/g, '-') : 'apiary';
  const date = new Date().toISOString().slice(0, 10);
  const pairs = getAdjacent();
  const lines = ['from,to'];
  pairs.forEach(([a, b]) => {
    const from = (hexes.find(h => h.id === a)?.text || '').trim();
    const to   = (hexes.find(h => h.id === b)?.text || '').trim();
    if (!from || !to || from === to) return;
    lines.push(`${csvField(from)},${csvField(to)}`);
  });
  dl(new Blob([lines.join('\n')], { type: 'text/csv' }), `${slug}_${date}.csv`);
});
```

- [ ] **Step 3: Verify — happy path (no slug)**

Open `index.html` in a browser. Add several hexes with labels (e.g. "trust", "reciprocity", "shared governance"). Move them close together so they touch (the adjacency list in the panel should show pairs).

Click **Export to CEnTR*CANON** with the slug input empty.

Expected:
- File downloads as `apiary_2026-05-26.csv` (today's date).
- File contents begin with header row `from,to`.
- Each subsequent row is a touching pair, e.g. `trust,reciprocity`.
- No `id`, `color`, `x`, `y`, `size` columns.

- [ ] **Step 4: Verify — with composite slug**

Type `student-advisory-board` into the Composite slug input. Click **Export to CEnTR*CANON**.

Expected:
- File downloads as `student-advisory-board_2026-05-26.csv`.
- File contents are the same edge list.

- [ ] **Step 5: Verify — RFC 4180 quoting**

Edit one hex label to be `community, engagement` (with a comma). Export.

Expected:
- That hex's label appears in the CSV as `"community, engagement"` (quoted).
- Other labels without commas/quotes/newlines are **not** quoted.

- [ ] **Step 6: Verify — isolated hexes produce no rows**

Add a hex with label `isolated` and place it far from all others (no adjacency shown in panel). Export.

Expected:
- The `isolated` hex does not appear in the CSV at all (no row where `from` or `to` is `isolated`).

- [ ] **Step 7: Verify — empty-label hexes are skipped**

Add a hex without typing any label (the hex exists on canvas with blank text). Move it adjacent to a labelled hex. Export.

Expected:
- No row is emitted for that pair (the blank-label hex is excluded).

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: replace CSV export with CEnTR*CANON-compliant edge list

- Emits from,to columns (NO WEIGHT + NO POLARITY — non-blocking for mod_gather)
- RFC 4180 quoting for labels containing commas, quotes, or newlines
- Skips isolated nodes and empty-label hexes
- Filename: {slug}_{YYYY-MM-DD}.csv (slug from new composite slug input)"
```

---

## Self-Review Checklist

- [x] **Spec coverage — edge list format**: Tasks 2 step 2 produces `from,to` header + pairs. ✓
- [x] **Spec coverage — RFC 4180 quoting**: `csvField()` handles commas, double-quotes, CRLF. ✓
- [x] **Spec coverage — no `weight`/`polarity` columns**: Omitted intentionally; `mod_gather` imputes. ✓
- [x] **Spec coverage — self-loop exclusion**: `from === to` guard in handler. ✓
- [x] **Spec coverage — empty-label exclusion**: `!from || !to` guard. ✓
- [x] **Spec coverage — filename convention**: `{slug}_{YYYY-MM-DD}.csv`. ✓
- [x] **Spec coverage — slug input**: Task 1 adds `<input id="slugInput">` to Data panel. ✓
- [x] **No placeholders**: All steps contain exact code. ✓
- [x] **Type consistency**: `csvField` defined in Task 2 step 1, called in step 2. ✓
- [x] **`getAdjacent()` return shape**: Returns `[hexA.id, hexB.id]` per line 461 — resolved via `hexes.find()`. ✓
- [x] **Design system**: Slug `<input type="text">` inherits global styles (width 100%, parchment bg, `--primary` focus). ✓
