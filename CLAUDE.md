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
- **Dependencies**: Google Fonts only (`Alegreya`, `Alegreya Sans`, `Alegreya Sans SC`, `Material Symbols Outlined` for toolbar icons). No JavaScript libraries.
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

Mutable globals: `hexes`, `nextId`, `selectedId`, `hexSize`, `snapToGrid`, `showGrid`, `newColor`, `dragging`, `edgeData`, `collectPolarity`, `collectMagnitude`, `collectDirection`.

`edgeData` is a plain object `{ [edgeKey]: { polarity?, magnitude?, direction? } }` — optional per-edge classifications, each dimension gated by its `collect*` parameter (all default off). `polarity` is `±1`, `magnitude` is `1`–`3`, `direction` is `'forward'` / `'reverse'` relative to `edgeKey`'s sort order (unset = bidirectional). Keyed on the sorted, lowercased term-label pair via `edgeKey(a, b)`, so classifications survive a Save→Load round-trip. Helpers `edgeField(key, field)` / `setEdgeField(key, field, value)` read and write single fields; setting `null`/`undefined` deletes the field, and an emptied entry is deleted whole.

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
| `csvField(str)` | RFC 4180 quoting for a single CSV field |
| `hashId(str)` | Deterministic, non-cryptographic hash → short stable id string for a contributor label |
| `slugify(label)` | Filename-safe slug: lowercase, whitespace → `_`, strips other unsafe characters |
| `getContributorLabel()` | Reads the trimmed value of the Group field |
| `adjacentTermPairs()` | Shared edge source for both Export csv and Save — labeled non-self-loop adjacent hex pairs as `{from, to}`, expanded to directed rows when `collectDirection` is on (`from` = influencer; unset direction → two rows), carrying `polarity` / `weight` per enabled parameter |
| `edgeKey(a, b)` | Sorted, lowercased, NUL-joined term-label pair → the stable key used for `edgeData` |
| `edgeField(k, f)` / `setEdgeField(k, f, v)` | Get / set one dimension field on an `edgeData` entry; `v` null/undefined deletes the field, an emptied entry is removed |
| `orderedLabels(la, lb)` / `influenceRows(la, lb)` | `orderedLabels` returns the pair in `edgeKey` sort order (original case); `influenceRows` resolves a pair's stored direction to `[[from, to], …]` — one row for forward/reverse, **two** rows when direction is unset |
| `resolveDirectionChoice(la, lb, choice)` | Maps a popup `'forward'`/`'reverse'` choice (relative to the displayed `la → lb`) to the value stored relative to `edgeKey` sort order |
| `syncDimensionCheckboxes()` | Writes the three `collect*` globals back onto the Edge Classification panel checkboxes (used after Load) |
| `loadBeeData(data)` | Rebuilds the hex canvas from a parsed `.bee` file's `edges`, re-applies `data.dimensions` to the three `collect*` parameters (conservative inference when absent), and repopulates `edgeData` from per-edge `effect` / `weight` / edge-order (see Import / Export) |

---

## Import / Export

The top toolbar (below the nav bar, above the two-column layout) has one field — **Group** — and three actions: **Load**, **Save**, **Export csv**. There is no raw node-list import/export anymore; both file formats are edge-based.

### Group
Free-text field (`#contributorLabelInput`, placeholder `e.g. Group A`), spaces allowed. Internally still referred to as the "contributor label" in code (id, function names) since it maps 1:1 onto the `contributor.label` field in the `.bee` interchange spec. Feeds two things:
- `hashId(label)` — a short deterministic id (e.g. `cwdsgcg`) written into `.bee` files as `contributor.id`. Same label always produces the same id.
- `slugify(label)` — lowercased, whitespace collapsed to `_`, unsafe characters stripped — used in both export filenames.

### Save
Writes a `.bee` JSON file: `{ version, contributor: { label, id }, dimensions: { polarity, magnitude, direction }, edges: [...] }`, matching the interchange spec Apiary Hive consumes (`bee-file-spec.json`, in the `apiary-hive` repo). The `dimensions` block (three booleans reflecting the Edge Classification parameters) is **always written**. Per edge: `weight: 1 | 2 | 3` only when `collectMagnitude` is on and the pair has a magnitude; `effect: 1 | -1` only when `collectPolarity` is on and the pair is classified; both otherwise omitted (the spec defaults each to `1` on ingest, same rationale as `NO WEIGHT`/`NO POLARITY` below). Direction is encoded by edge order (`from` = influencer) — a pair with the direction parameter on but no direction set is written as **two directed edge objects**. Edges come from `adjacentTermPairs()`. Filename: `{slug}.bee` (no date — a stable working-file name, unlike the dated CSV).

### Load
Reads a `.bee` file and rebuilds the canvas from its `edges`. Positions aren't part of the `.bee` spec, so `loadBeeData()` re-lays-out the terms on the same hex grid used by snap-to-grid: it walks the edge graph and seats each term in a free grid cell next to an already-placed neighbor. The placement is constrained so it will **never seat two unrelated terms as grid-neighbors** — a cell is only valid for a term if every already-occupied grid-neighbor of that cell is a real graph-neighbor of that term. This is deliberately a correctness-over-completeness tradeoff:
- **Never fabricates an adjacency.** Verified by round-tripping synthetic graphs (dense random graphs, disconnected components, triangles, high-degree hubs) through the actual code and diffing expected vs. reconstructed edges — zero false positives across all cases tested.
- **May not show every true edge as touching.** A term connected to more than 6 others (the hex grid's physical neighbor limit) or part of a tightly-closed cluster (e.g. a triangle) may end up with some of its edges not visually adjacent after reload, even though the relationship still existed in the source file.
- **Terms with no edge at all can't round-trip.** The `.bee` format only carries the edge list, not isolated nodes — a hex with zero adjacent neighbors is dropped by Save and can never be restored by Load. This mirrors the CSV export's existing isolated-node behavior (see Edge Rules below), now extended to Save/Load too.
- On success, also restores `contributor.label` into the Group field. `data.dimensions` re-applies the three Edge Classification parameters and syncs their checkboxes; when the block is absent, they are inferred conservatively (polarity from any `effect` ±1, magnitude from any `weight` in 1–3, direction only if some pair appears in both orders). `edgeData` is reset, then repopulated from each edge's `effect` → `polarity`, `weight` → `magnitude`, and edge order → `direction` (a pair seen in one order → forward/reverse; seen both ways → left unset).

### Export csv
Downloads an **edge list** — `from,to` columns, RFC 4180 quoted, built from `adjacentTermPairs()` — matching the CEnTR\*CANON ingestion contract in `docs/apiary-output-specification.md`. Columns after `from,to` are `weight` / `polarity` / `direction` **in that order**, each present **iff its parameter is on** — even if every value is empty (a classified edge whose parameter is off exports with no column for that dimension; this changed from the interim polarity behaviour, which force-added the column whenever any edge was classified). `direction` is a constant `1` on every row; its **presence** flags directed mode (`from` = influencer, read from row order), and an unclassified pair emits two rows (one each way). Filename: `{slug}_{YYYY-MM-DD}.csv` (dated — a point-in-time deliverable, unlike Save).

### Edge classification
Three optional dimensions, each toggled by a checkbox in the **Edge Classification** panel section (`--challenge` stripe, between Selected Hex and Adjacency): **Polarity** (`+` / `–`), **Magnitude** (`1`–`3`), **Direction** (influence). All default off — with all off there is no midpoint affordance and edges render as plain lines. When any is on, `#edgeLegend` (populated by `syncEdgeLegend()`, called from `render()` and `syncDimensionCheckboxes()`) shows one key line per enabled dimension directly under the toggles.

Enabling **Direction** while `edgeData` is non-empty fires a `confirm()` (spec §11 D5): direction reinterprets existing polarity/magnitude marks from associative to causal, so the checkbox reverts on cancel. The **Adjacency** panel list renders a directed pair as `influencer  →  influenced` (via `influenceRows()`) when Direction is on and the pair has a stored direction; otherwise `a  ↔  b`.

Hovering (or clicking) the transparent hit-rect over any edge badge between two **labeled** hexes opens `#edgePop`, one row per enabled dimension in **polarity / magnitude / direction** order (matching the panel). The direction row's buttons show the real term labels (`care → power` / `power → care`) plus `both ways`; `both`/`clear` both store `null`. The popup anchors below the pointer, flipping above when there's no room. Button values: `1` / `-1` / `clear` / `1` / `2` / `3` / `clear` / `forward` / `reverse` / `both`.

Badge rendering, all in the `#edgeBadges` overlay group (above `#hexes`, so badges survive the edge line being hidden under the two touching hexes). Every set dimension for an edge collapses into **one pill** offset `OFF` (`max(34, size*0.8)`) along the edge's perpendicular — clear of the touching hex bodies — with a thin leader line back to the midpoint and a single ≥28px transparent hit-rect over it. An unclassified edge (dimensions on, nothing set) shows a plain grey affordance dot at the midpoint instead. Inside the pill, in fixed order:
- **polarity** — colored disc with `+` / `–` (green `--secondary` for `+`, plum `--serve` for `–`). Also sets the edge line color + solid stroke.
- **magnitude** — the digit as `<text>`; also widens the edge line to `1.5 + magnitude`.
- **direction** — a `<polygon>` triangle rotated parallel to the edge, pointing influencer → influenced, **only** for a stored forward/reverse.

An explicit neutral polarity (`0`) is still not exposed; unclassified and neutral both export as "not characterized".

---

## Adjacency Detection

`getAdjacent()` uses Euclidean distance between hex centers. Two hexes are adjacent if their center-to-center distance is less than `hexSize * Math.sqrt(3) * 1.05 * 1.1` (≈ `hexSize * 2`, a 15.5% tolerance above the exact hex-grid neighbor distance to accommodate imperfect placement). This is the same proximity data that drives Export csv and Save.

`getClusters(pairs)` runs union-find over the adjacent pairs to identify connected components. The cluster count is displayed in the panel (`#clustersText`).

---

## Snap-to-Grid

Grid spacing is derived from `hexSize`: columns are offset by `hexSize * 1.5`, rows by `hexSize * Math.sqrt(3)`, with alternating column offsets to produce a proper hexagonal tessellation. `snapPos(x, y)` finds the nearest grid anchor via brute-force search over a bounded range of candidate cells.

---

## Layout

Two-column responsive grid (CSS Grid): a 280px control panel on the left and the SVG canvas on the right (min-width: 1024px breakpoint). Below 1024px, the panel stacks above the canvas.

---

## Extending the App

- **Expose the neutral polarity state (`0`)**: `edgeData`'s `polarity` field and both exports already carry signed values; add a middle button to the edge popup's polarity row and let the badge/CSV/`.bee` represent `0` distinctly from unclassified. The spec permits `0` (neutral / ambiguous).
- **MICMAC (influence × dependence)** is a supported downstream when `collectDirection` + `collectMagnitude` are both on: the directed weighted edge list from `adjacentTermPairs()` / Export csv is a straight pivot into the influence matrix (`M[from][to] += weight`), built downstream — Apiary itself has no in-app matrix view.
- **One-time confirm on enabling direction** (spec §11 D5, not shipped): turning `collectDirection` on when `edgeData` already has entries reinterprets existing polarity/magnitude marks from associative to causal. A `confirm()` on that checkbox transition would surface it; dropped as low-value polish.
- **Multi-session load**: Allow loading a second `.bee` file to overlay a second contributor's map for comparison, rather than Load always replacing the canvas outright.
- **Session-lossless save (optional, non-spec)**: Save/Load are edge-based by design (see Import / Export), so isolated hexes and exact positions/colors don't round-trip. If that's ever a problem in practice, the `.bee` format's `additionalProperties: true` would allow a non-standard extra field (e.g. `hexes`) carrying the full canvas snapshot alongside the standard `edges`, without breaking spec compliance for downstream consumers that only read `edges`/`contributor`.

---

## Project Context

Apiary is part of the **CEnTRInnovations open tools ecosystem**. Its immediate downstream consumer is **Apiary Hive**, which gathers `.bee` files from multiple contributor Hives and consolidates their vocabulary into one canonical term set before handing off to **CEnTR\*CANON**'s `mod_gather` → `mod_cartography` pipeline. Apiary maps encode a single contributor's (or composite perspective's) relational understanding of CE-R vocabulary as an undirected graph — exported either as a `.bee` file (`contributor.label`/`contributor.id` + edges, for Apiary Hive) or as a CSV edge list (`from,to`, for direct CEnTR\*CANON ingestion per `docs/apiary-output-specification.md`).

When the optional **direction** + **magnitude** dimensions are enabled, an Apiary map also serves **MICMAC** structural analysis (influence × dependence) downstream: the directed weighted edge list is pivoted straight into an influence matrix (`M[from][to] += weight`) by the consuming tool, not by Apiary.

Related infrastructure: CEnTR\*MAP (spatial analysis), CEnTR\*SEEK (literature synthesis), CEnTR\*IMPACT (impact mapping), CAFE Lab (the coordinating research lab).

Maintained by Jeremy Price, Indiana University Indianapolis.
