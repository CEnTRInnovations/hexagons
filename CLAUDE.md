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
| `csvField(str)` | RFC 4180 quoting for a single CSV field |
| `hashId(str)` | Deterministic, non-cryptographic hash → short stable id string for a contributor label |
| `slugify(label)` | Filename-safe slug: lowercase, whitespace → `_`, strips other unsafe characters |
| `getContributorLabel()` | Reads the trimmed value of the Group field |
| `adjacentTermPairs()` | Shared edge source for both Export csv and Save — labeled, non-self-loop adjacent hex pairs as `{from, to}` |
| `loadBeeData(data)` | Rebuilds the hex canvas from a parsed `.bee` file's `edges` (see Import / Export) |

---

## Import / Export

The top toolbar (below the nav bar, above the two-column layout) has one field — **Group** — and three actions: **Load**, **Save**, **Export csv**. There is no raw node-list import/export anymore; both file formats are edge-based.

### Group
Free-text field (`#contributorLabelInput`, placeholder `e.g. Group A`), spaces allowed. Internally still referred to as the "contributor label" in code (id, function names) since it maps 1:1 onto the `contributor.label` field in the `.bee` interchange spec. Feeds two things:
- `hashId(label)` — a short deterministic id (e.g. `cwdsgcg`) written into `.bee` files as `contributor.id`. Same label always produces the same id.
- `slugify(label)` — lowercased, whitespace collapsed to `_`, unsafe characters stripped — used in both export filenames.

### Save
Writes a `.bee` JSON file: `{ version, contributor: { label, id }, edges: [{ from, to }] }`, matching the interchange spec Apiary Hive consumes (`bee-file-spec.json`, in the `apiary-hive` repo). `weight`/`effect` are omitted from each edge — Apiary doesn't collect either yet, and the spec defaults both to `1` on ingest, same rationale as `NO WEIGHT`/`NO POLARITY` below. Edges come from `adjacentTermPairs()`. Filename: `{slug}.bee` (no date — a stable working-file name, unlike the dated CSV).

### Load
Reads a `.bee` file and rebuilds the canvas from its `edges`. Positions aren't part of the `.bee` spec, so `loadBeeData()` re-lays-out the terms on the same hex grid used by snap-to-grid: it walks the edge graph and seats each term in a free grid cell next to an already-placed neighbor. The placement is constrained so it will **never seat two unrelated terms as grid-neighbors** — a cell is only valid for a term if every already-occupied grid-neighbor of that cell is a real graph-neighbor of that term. This is deliberately a correctness-over-completeness tradeoff:
- **Never fabricates an adjacency.** Verified by round-tripping synthetic graphs (dense random graphs, disconnected components, triangles, high-degree hubs) through the actual code and diffing expected vs. reconstructed edges — zero false positives across all cases tested.
- **May not show every true edge as touching.** A term connected to more than 6 others (the hex grid's physical neighbor limit) or part of a tightly-closed cluster (e.g. a triangle) may end up with some of its edges not visually adjacent after reload, even though the relationship still existed in the source file.
- **Terms with no edge at all can't round-trip.** The `.bee` format only carries the edge list, not isolated nodes — a hex with zero adjacent neighbors is dropped by Save and can never be restored by Load. This mirrors the CSV export's existing isolated-node behavior (see Edge Rules below), now extended to Save/Load too.
- On success, also restores `contributor.label` into the Group field.

### Export csv
Downloads an **edge list** — `from,to` columns, RFC 4180 quoted, built from `adjacentTermPairs()` — matching the CEnTR\*CANON ingestion contract in `docs/apiary-output-specification.md`. `weight`/`polarity` are omitted (produces the acceptable `NO WEIGHT` + `NO POLARITY` file state). Filename: `{slug}_{YYYY-MM-DD}.csv` (dated — a point-in-time deliverable, unlike Save).

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

- **Add a `weight` UI**: A range input or numeric field on the Selected Hex editor, stored as `h.weight` on the hex object. `adjacentTermPairs()`/the `.bee` export could then read edge weight from the average of the two adjacent hexes' weights, or from a separate edge data structure.
- **Add a `polarity` selector**: A three-state toggle (`-1` / `0` / `1`) per adjacency pair, requiring an edge data structure keyed on `[idA, idB]` pairs. Would populate `effect` in the `.bee` export and `polarity` in the CSV, moving both out of their current `NO WEIGHT`/`NO POLARITY`-equivalent states.
- **Multi-session load**: Allow loading a second `.bee` file to overlay a second contributor's map for comparison, rather than Load always replacing the canvas outright.
- **Session-lossless save (optional, non-spec)**: Save/Load are edge-based by design (see Import / Export), so isolated hexes and exact positions/colors don't round-trip. If that's ever a problem in practice, the `.bee` format's `additionalProperties: true` would allow a non-standard extra field (e.g. `hexes`) carrying the full canvas snapshot alongside the standard `edges`, without breaking spec compliance for downstream consumers that only read `edges`/`contributor`.

---

## Project Context

Apiary is part of the **CEnTRInnovations open tools ecosystem**. Its immediate downstream consumer is **Apiary Hive**, which gathers `.bee` files from multiple contributor Hives and consolidates their vocabulary into one canonical term set before handing off to **CEnTR\*CANON**'s `mod_gather` → `mod_cartography` pipeline. Apiary maps encode a single contributor's (or composite perspective's) relational understanding of CE-R vocabulary as an undirected graph — exported either as a `.bee` file (`contributor.label`/`contributor.id` + edges, for Apiary Hive) or as a CSV edge list (`from,to`, for direct CEnTR\*CANON ingestion per `docs/apiary-output-specification.md`).

Related infrastructure: CEnTR\*MAP (spatial analysis), CEnTR\*SEEK (literature synthesis), CEnTR\*IMPACT (impact mapping), CAFE Lab (the coordinating research lab).

Maintained by Jeremy Price, Indiana University Indianapolis.
