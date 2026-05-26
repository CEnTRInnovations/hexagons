# CLAUDE.md — Apiary

**Apiary** is a browser-based hexagonal thinking tool built and maintained by CEnTRInnovations CAFE Lab. It supports participatory visual facilitation in community-engaged research and education contexts.

Live at: [centrinnovations.github.io/hexagons/](https://centrinnovations.github.io/hexagons/)

---

## What This App Does

Apiary implements hexagonal thinking — a systems facilitation technique in which participants label movable tiles (hexagons) with concepts, arrange them spatially, and surface meaning through adjacency and clustering. It is used in stakeholder workshops, cross-sector convenings, graduate seminars, and community-engaged scholarship settings.

The tool's core contribution is making adjacency relationships computable: which concepts are placed next to each other is the primary unit of analysis, not the labels themselves. Clusters of touching hexagons surface emergent groupings across participants.

---

## Tech Stack

- **Single-file SPA**: Everything lives in `index.html` — HTML, CSS, and vanilla JavaScript. No build system, no npm, no bundler.
- **Rendering**: SVG canvas (`<svg id="canvas">`) with three layer groups: `#grid`, `#edges`, `#hexes`.
- **Dependencies**: Google Fonts only (`Alegreya`, `Alegreya Sans`, `Alegreya Sans SC`). No JavaScript libraries.
- **Deployment**: GitHub Pages (static hosting). The `CNAME` file points to a custom domain.

---

## Design System

Apiary uses the **CEnTRInnovations design system** — a warm parchment palette defined via CSS custom properties at `:root`:

| Token | Value | Role |
|---|---|---|
| `--bg-main` | `#F6F2E7` | Canvas and input backgrounds |
| `--bg-light` | `#F0EAD8` | Panel background |
| `--bg-mid` | `#E2D4B8` | Nav background |
| `--text` | `#3E3B35` | Body text |
| `--primary` | `#3F5E78` | Actions, focus rings |
| `--secondary` | `#3B6B35` | Data section accent |
| `--challenge` | `#8C6E45` | Default accent stripe, brand span |
| `--serve` | `#7A4A62` | Adjacency section accent |

Typography uses Alegreya (serif, headings) and Alegreya Sans (sans-serif, body/UI). Small-caps labels use `Alegreya Sans SC`.

The 15-color hexagon palette is defined in the `PALETTE` constant at the top of the script block. When adding color options, extend that array.

---

## Data Model

Each hexagon is a plain JavaScript object stored in the `hexes` array:

```js
{
  id:    Number,   // auto-incrementing integer
  text:  String,   // label displayed on the hex
  color: String,   // hex color string (e.g. "#3B6B35")
  x:     Number,   // SVG canvas x-coordinate (center)
  y:     Number,   // SVG canvas y-coordinate (center)
  size:  Number    // radius in pixels (30–110)
}
```

Mutable globals: `hexes`, `nextId`, `selectedId`, `hexSize`, `snapToGrid`, `showGrid`, `newColor`, `dragging`.

---

## Key Functions

| Function | Purpose |
|---|---|
| `hexPoints(cx, cy, r)` | Generates the 6 SVG polygon points for a hex |
| `renderGrid()` | Draws the snap-to-grid dot overlay |
| `snapPos(x, y)` | Maps a raw position to the nearest grid anchor |
| `getAdjacent()` | Returns all touching hex pairs (proximity-based) |
| `getClusters(pairs)` | Union-find over adjacent pairs → cluster arrays |
| `renderAdjacency()` | Writes the adjacency list and cluster count to the panel |
| `renderHex(h)` | Creates/updates a single hexagon's SVG elements |
| `render()` | Full re-render: grid, adjacency, all hexes, selected editor |
| `renderSelectedEditor()` | Populates the Selected Hex panel for the active hex |
| `svgCoords(e)` | Translates a pointer event to SVG-space coordinates |
| `onHexMouseDown(e, id)` | Initiates drag on a hex; handles click-vs-drag disambiguation |
| `dl(blob, name)` | Triggers a file download from a Blob |

---

## Import / Export

### Import JSON
Accepts a JSON array of hex objects (same shape as the `hexes` array). Replaces the current canvas state.

### Export JSON
Downloads the full `hexes` array as `apiary.json`. Suitable for session continuity and cross-session re-import.

### Export CSV (current behavior — see gap below)
Downloads a **node list** with columns: `id, text, color, x, y, size`.

---

## ⚠️ Known Gap: CSV Export Does Not Match CEnTR\*CANON Ingestion Contract

**This is the most important open issue in the codebase.**

CEnTR\*CANON's `mod_gather` module expects an **undirected edge list** from Apiary, not a node list. The authoritative contract is in `docs/apiary-output-specification.md`.

### Required output schema

```csv
from,to,weight,polarity
```

| Column | Required | Default on missing |
|---|---|---|
| `from` | Yes | — (row dropped if empty) |
| `to` | Yes | — (row dropped if empty) |
| `weight` | No | `1` |
| `polarity` | No | `1` (supportive) |

### What needs to change in `index.html`

The `btnExportCSV` click handler (currently around line 757) must be replaced. Instead of iterating over `hexes`, it should:

1. Call `getAdjacent()` to retrieve the array of touching `[hexA, hexB]` pairs.
2. For each pair, emit a row with `from` = `hexA.text`, `to` = `hexB.text`.
3. Omit `weight` and `polarity` columns for now (CEnTR\*CANON will impute defaults; this produces a `NO WEIGHT` + `NO POLARITY` file state, which is fully acceptable for v1).
4. Apply RFC 4180 quoting: fields containing commas or double-quotes must be wrapped in double-quotes.

### Edge rules to respect
- Self-loops (`from == to`) should not be exported.
- Hexes with no adjacent neighbors contribute no rows (isolated nodes add no structural signal).
- Duplicate pairs are acceptable; CEnTR\*CANON sums weights and averages polarity on its end.

### Recommended filename convention
```
{composite_slug}_{YYYY-MM-DD}.csv
```
Example: `student-advisory-board_2026-05-26.csv`. Consider adding a text input to the Data panel for the contributor/composite slug before export.

### Validation states in CEnTR\*CANON
After upload, `mod_gather` assigns one of: `VALID`, `NO WEIGHT`, `NO POLARITY`, or `SCHEMA MISMATCH`. The last state blocks the Survey phase gate. Producing a correct edge list is therefore a prerequisite for downstream CEnTR\*MAP analysis.

---

## Adjacency Detection

`getAdjacent()` uses Euclidean distance between hex centers. Two hexes are adjacent if their center-to-center distance is less than `hexSize * 2 * 0.95` (a 5% tolerance accommodates imperfect placement). This is the same proximity data that needs to drive the CEnTR\*CANON CSV export.

`getClusters(pairs)` runs union-find over the adjacent pairs to identify connected components. The cluster count is displayed in the panel (`#clustersText`).

---

## Snap-to-Grid

Grid spacing is derived from `hexSize`: columns are offset by `hexSize * 1.5`, rows by `hexSize * Math.sqrt(3)`, with alternating column offsets to produce a proper hexagonal tessellation. `snapPos(x, y)` finds the nearest grid anchor via brute-force search over a bounded range of candidate cells.

---

## Layout

Two-column responsive grid (CSS Grid): a 280px control panel on the left and the SVG canvas on the right (min-width: 1024px breakpoint). Below 1024px, the panel stacks above the canvas.

---

## Extending the App

- **Add a `weight` UI**: A range input or numeric field on the Selected Hex editor, stored as `h.weight` on the hex object. The adjacency export could then read edge weight from the average of the two adjacent hexes' weights, or from a separate edge data structure.
- **Add a `polarity` selector**: A three-state toggle (`-1` / `0` / `1`) per adjacency pair, requiring an edge data structure keyed on `[idA, idB]` pairs.
- **Composite slug input**: A text field in the Data panel that pre-fills the export filename with the contributor/perspective name.
- **Multi-session import**: Allow loading a second JSON file to overlay a second contributor's map for comparison.

---

## Project Context

Apiary is part of the **CEnTRInnovations open tools ecosystem**. Its primary downstream consumer is **CEnTR\*CANON**, which runs the `mod_gather` → `mod_cartography` pipeline for community-engaged research vocabulary mapping. Apiary maps encode a single contributor's (or composite perspective's) relational understanding of CE-R vocabulary as an undirected weighted graph.

Related infrastructure: CEnTR\*MAP (spatial analysis), CEnTR\*SEEK (literature synthesis), CEnTR\*IMPACT (impact mapping), CAFE Lab (the coordinating research lab).

Maintained by Jeremy Price, Indiana University Indianapolis.
