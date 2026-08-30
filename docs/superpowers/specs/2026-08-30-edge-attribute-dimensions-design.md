# Edge Attribute Dimensions — Design

**Status:** Draft for review
**Date:** 2026-08-30
**Depends on:** `94e67b7` (optional +/- polarity classification for edges)

---

## 1. Goal

Turn edge classification into three **independent, optional dimensions**, each
switched by a map-level on/off parameter:

| Dimension | What it records | Off (default) |
|---|---|---|
| **polarity** | valence of the relation — `+` / `–` | no valence |
| **magnitude** | strength of the relation — `1` / `2` / `3` | no strength |
| **direction** | which term influences which — `→` / `←` / `↔` | undirected |

All three default **off**. With all off, a map is exactly what it is today: an
undirected, unweighted, unsigned adjacency graph. A facilitator turns on only the
dimensions their downstream analysis needs.

The immediate downstream driver is **MICMAC** (structural analysis:
influence × dependence). MICMAC needs `direction` + `magnitude`; it does not use
`polarity`. Polarity remains the signed-network dimension already shipped.

---

## 2. Scope

### In

- Three map-level boolean parameters, defaulting off, in a new panel section.
- A unified per-edge attribute store (`edgeData`), replacing the standalone
  `edgePolarity` object.
- Edge-popup controls that appear only for enabled dimensions.
- Midpoint badge rendering for each enabled, classified dimension.
- CSV and `.bee` export carrying whichever dimensions are enabled.
- `loadBeeData()` reading the dimensions back and auto-enabling their parameters.
- Doc updates to `docs/apiary-output-specification.md`.

### Out

- Explicit neutral polarity (`0`). Unchanged from the shipped feature.
- Any Kumu / causal-loop-diagram export shaping (loop detection, R/B labels).
- An in-app MICMAC matrix view or influence/dependence plot. Downstream builds
  the matrix from the directed weighted edge list.
- Per-cluster or per-region parameters. Parameters are whole-map.
- Deriving edge magnitude from hex properties (the averaged-`h.weight` idea in
  `CLAUDE.md` → "Extending the App"). Magnitude is recorded per edge directly —
  MICMAC wants per-edge influence, and averaging two node weights would be a
  worse signal.
- Changes to `apiary-hive`'s `bee-file-spec.json`. Apiary will write a new
  top-level `dimensions` field; the `.bee` spec's `additionalProperties: true`
  makes that safe to ingest today. A spec PR in that repo is follow-up, not part
  of this work.

---

## 3. Data model

### 3.1 Chosen approach: unified `edgeData`

Replace the global `edgePolarity = {}` with:

```js
// { [edgeKey]: { polarity?: 1 | -1, magnitude?: 1 | 2 | 3, direction?: 'forward' | 'reverse' | 'both' } }
let edgeData = {};
```

- Keyed on `edgeKey(labelA, labelB)` — the existing sorted, lowercased,
  NUL-joined term-label pair. Unchanged: keys are labels, not hex ids, so
  classifications survive Save → Load.
- Each sub-field is independently optional. An absent field = that dimension is
  unclassified for that edge (regardless of whether its parameter is on).
- An entry with `{}` or all-absent fields is equivalent to no entry; writers
  should `delete edgeData[k]` when it empties.

`direction` values are **relative to `edgeKey`'s sorted order**:
`edgeKey` returns the pair as `[first, second]` (sorted). `'forward'` means
`first → second`, `'reverse'` means `second → first`, `'both'` means mutual.
A helper resolves this to real term labels at render/export time.

### 3.2 Alternatives rejected

- **Parallel side-objects** (`edgeMagnitude`, `edgeDirection` next to
  `edgePolarity`): three maps to keep in sync across render / export / load /
  self-check. Rejected — the unified object is barely more code and has one
  migration point.
- **Real edge objects in an array** (`edges = [{a, b, ...}]` alongside `hexes`):
  edges gain identity and lifecycle. Rejected as over-built for three optional
  fields on a structure that is currently, and can stay, derived-on-render.

### 3.3 Migration from `edgePolarity`

`edgePolarity[k] = v` becomes `setEdgeField(k, 'polarity', v)`. Call sites to
update (all in `index.html`):

- `renderAdjacency()` badge block — read `edgeData[k]?.polarity`
- `adjacentTermPairs()` — read all three fields
- `loadBeeData()` — populate `edgeData` from file
- the edge-popup button handler
- `demo()` self-check
- `CLAUDE.md` references

---

## 4. Parameters

### 4.1 Globals

```js
let collectPolarity  = false;
let collectMagnitude = false;
let collectDirection = false;
```

Added to the mutable-globals list in `CLAUDE.md`.

### 4.2 UI — new panel section

A new section in the left panel, between **Selected Hex** and **Adjacency**
(`index.html` ~line 451):

```
Edge Data
────────────  (stripe: var(--challenge))
☐ Polarity   (+ / –)
☐ Magnitude  (1–3)
☐ Direction  (influence)
```

Uses the existing `.a-toggle-row` markup (same as Show grid / Snap to grid).
Each checkbox `change` handler sets its global and calls `render()`.

### 4.3 Persistence

- **`.bee`**: a new top-level field
  `"dimensions": { "polarity": bool, "magnitude": bool, "direction": bool }`.
- **CSV**: signalled by **column presence**, extending the existing convention
  (`docs/apiary-output-specification.md` §4: `NO WEIGHT` / `NO POLARITY` = column
  absent). `polarity` present ⇒ polarity collected; `weight` present ⇒ magnitude
  collected; `direction` present ⇒ direction collected.

---

## 5. Edge popup

The affordance dot at an edge midpoint appears when **any** `collect*` parameter
is on and the edge is classifiable (both hexes labeled, labels differ). With all
parameters off there is no dot — plain lines, today's default.

The popup shows one row per enabled parameter:

| Row | Buttons | Stores |
|---|---|---|
| Polarity | `+` · `–` · `clear` | `polarity: 1 / -1 / (delete)` |
| Magnitude | `1` · `2` · `3` · `clear` | `magnitude: 1 / 2 / 3 / (delete)` |
| Direction | `A→B` · `B→A` · `A↔B` · `clear` | `direction: forward / reverse / both / (delete)` |

The Direction row labels show the two **actual term texts** (e.g. `care → power`)
so "which way" is unambiguous. Row order: Direction, Polarity, Magnitude.

Popup open/close behavior (hover with grace timeout, click, `stopPropagation`
on click to not add a hex) is unchanged from the shipped feature.

---

## 6. Rendering

All badges live in the existing `#edgeBadges` overlay group (above `#hexes`, so
they survive the edge line being hidden under the two touching hexes).

- **magnitude** — edge line `stroke-width` scales: `1.5 + magnitude` px. Plus the
  digit rendered in the midpoint badge.
- **polarity** — colored badge as shipped: green `--secondary` `+`,
  plum `--serve` `–`.
- **direction** — a chevron glyph in the midpoint badge pointing along the edge
  toward the influenced term; a double-headed chevron for `both`.

When more than one dimension is classified on an edge, the midpoint badge is a
small horizontal pill: `[chevron] [± ] [digit]`, each part present only if set.
Unclassified-but-classifiable edges keep the single faint grey affordance dot.

---

## 7. Export — CSV

Built from `adjacentTermPairs()`, which gains the three fields per pair when set.

### 7.1 Columns

Header is `from,to` plus, appended in this order, one column per **enabled**
parameter:

- `collectMagnitude` ⇒ `weight` column (`1`/`2`/`3`, empty when that edge is
  unclassified — empty imputes to `1` downstream, per §3.3 of the output spec)
- `collectPolarity` ⇒ `polarity` column (`1`/`-1`, empty when unclassified)
- `collectDirection` ⇒ `direction` column, constant value `1` on every emitted
  row (see 7.2). The column carries no per-row information — its **presence** is
  the directed-mode flag, and it makes the `from` = influencer convention
  explicit to a human reader. A downstream reader keys off column presence, then
  reads direction from row order.

If a parameter is on but **no** edge carries that field, the column is still
emitted (all-empty) — the parameter being on is the contributor's assertion that
the dimension was considered. This differs from the shipped polarity behavior
(which omitted the column unless ≥1 edge was classified); the parameter now
carries that intent explicitly, so column presence follows the parameter, not
the data.

### 7.2 Direction semantics

When `collectDirection` is **off**: `from`/`to` are arbitrary (sorted order), as
today. Edge list is undirected.

When `collectDirection` is **on**:

- `from` is the **influencer**, `to` the **influenced**.
- `direction: 'forward'` → one row `first,second,…,1`
- `direction: 'reverse'` → one row `second,first,…,1`
- `direction: 'both'` → **two rows**, `first,second,…,1` and `second,first,…,1`
- **`direction` unset** → the pair is **dropped** from the export.

The drop rule is deliberate: with direction on, the map is an influence graph,
and a touching pair with no assigned direction is not an influence claim. This
mirrors the existing "isolated hexes are dropped" correctness-over-completeness
stance (`CLAUDE.md` → Load, and §6 of the output spec). It is the most debatable
decision here — see §11.

Downstream builds the MICMAC matrix directly: `M[from][to] += weight`
(weight defaulting to 1 when magnitude is off or the cell is blank).

### 7.3 Filename

Unchanged: `{slug}_{YYYY-MM-DD}.csv`.

---

## 8. Export — `.bee`

```jsonc
{
  "version": "1.0",
  "contributor": { "label": "...", "id": "..." },
  "dimensions": { "polarity": false, "magnitude": true, "direction": true },
  "edges": [
    { "from": "care", "to": "power", "weight": 2, "effect": 1 }
  ]
}
```

- `dimensions` — new, always written, reflects the three parameters.
- `weight` — written per edge **only when `collectMagnitude` is on and that edge
  has a magnitude**. The `.bee` spec already defines `weight` (default 1).
- `effect` — written per edge only when `collectPolarity` is on and the edge has
  a polarity. Unchanged from shipped behavior (`1` / `-1`).
- **direction** — encoded by edge order and duplication, same rules as CSV §7.2:
  `from` = influencer; `both` → two edge objects; unset → dropped when
  `collectDirection` is on. When `collectDirection` is off, current arbitrary
  order.

Edges still come from `adjacentTermPairs()`. Filename unchanged: `{slug}.bee`.

---

## 9. Import — `loadBeeData()`

1. Reset `edgeData = {}`.
2. Read `data.dimensions` (if present) → set `collectPolarity` /
   `collectMagnitude` / `collectDirection` and sync the three checkboxes.
   If `dimensions` is absent, infer: `collectPolarity` from any `effect`,
   `collectMagnitude` from any `weight` that is present and ≠ the default,
   `collectDirection` from any reversed-pair duplicate or explicit ordering
   signal — conservatively, only enable direction if `dimensions` says so or a
   pair appears in both orders.
3. For each edge, populate `edgeData[edgeKey(from,to)]`:
   - `effect` (`1`/`-1`) → `polarity`
   - `weight` (`1`/`2`/`3`) → `magnitude` (ignore non-1..3 numbers)
   - direction: first occurrence of an ordered pair → `forward`/`reverse`
     relative to `edgeKey` order; seeing both orders for one pair → `both`
4. Layout is unchanged — it walks the **undirected** adjacency (`from`/`to` as an
   unordered pair), so direction never affects hex placement.

The existing correctness guarantees of the layout algorithm are unaffected: it
still never seats two non-adjacent terms as grid-neighbors.

---

## 10. Downstream contract — `docs/apiary-output-specification.md`

- **§3** — add a `§3.5 direction` subsection: optional; when the `direction`
  column is present, `from` is the influencer and `to` the influenced; absence
  of the column means the edge list is undirected (current default). Reversed
  duplicate rows represent a mutual pair.
- **§4** — note that `polarity` / `weight` / `direction` column presence now
  tracks an explicit contributor parameter, so an all-empty column is possible
  and still means "dimension considered."
- **§4.4** (`NO POLARITY`) — already updated in `94e67b7`; add the analogous note
  that `NO WEIGHT` is now also a togglable state rather than a permanent one.
- **§7** — `.bee` differences list: document the new `dimensions` object and that
  `weight` / `effect` / edge-ordering are parameter-gated.
- **§8** — add an example with `direction` + `weight` (the MICMAC-shaped export).
- Changelog row.

A short note in `CLAUDE.md` → Project Context that MICMAC (influence × dependence)
is a supported downstream when direction + magnitude are enabled, and that the
influence matrix is a straight pivot of the directed weighted edge list, built
downstream.

---

## 11. Decisions & edge cases

| # | Decision | Rationale | Risk |
|---|---|---|---|
| D1 | Parameters are whole-map, not per-edge | You never want half a map directed for one analysis | none |
| D2 | With `collectDirection` on, undirected pairs are **dropped** from export | The map is an influence graph; no direction = no influence claim; matches isolated-hex behavior | A contributor who enables direction but forgets to classify some edges loses them silently — mitigate with a pre-export count ("12 of 18 edges have a direction; 6 will be omitted") |
| D3 | Column present whenever its parameter is on, even if all-empty | The parameter is the explicit "considered" signal; removes the shipped feature's data-inferred column logic | Slightly more verbose CSV |
| D4 | `magnitude` scale is `1–3`, no `0` | `0` = "no influence" = simply don't classify the edge; MICMAC convention | none |
| D5 | Turning `collectDirection` on **reinterprets** existing polarity/magnitude from associative to causal meaning | Documented; the popup help text and badge are mode-neutral glyphs | A map built associatively then switched to causal carries marks whose meaning changed — add a one-time confirm on enabling `direction` when `edgeData` is non-empty |
| D6 | `both` emits two rows / two edge objects | MICMAC matrix wants directed cells; two mutual cells is the honest encoding | Doubles a mutual edge's weight contribution to cluster metrics — acceptable, and correct for influence/dependence |
| D7 | Direction stored relative to `edgeKey` sort order, not raw hex order | Keeps the label-keyed, Save/Load-stable design | Helper indirection at render/export |

---

## 12. Behavior change to the shipped polarity feature

- The always-visible grey affordance dot now appears only when a `collect*`
  parameter is on. Default map = clean lines (pre-`94e67b7` appearance).
- CSV `polarity` column: emitted whenever `collectPolarity` is on (was: only when
  ≥1 edge classified).
- `.bee` `effect`: unchanged (per-edge, only when set).
- `edgePolarity` global renamed to `edgeData` with a `polarity` sub-field.

These are acceptable because the feature shipped days ago on this branch and has
no external consumers yet.

---

## 13. Testing

Extend `demo()` (runs on `#test`):

- `edgeData` round-trips all three fields through `adjacentTermPairs()` → `.bee`
  object → `loadBeeData()`.
- CSV header reflects exactly the enabled parameters; a parameter on with zero
  classified edges still emits its (empty) column.
- Direction: `forward` → one ordered row; `both` → two rows; unset + direction on
  → row absent.
- `dimensions` block written to `.bee` and re-applied on load (checkboxes + globals).
- `edgeKey`-relative direction resolves to the correct term labels regardless of
  hex id order.

Manual: open in browser, enable each toggle, classify an edge, export, reload.

---

## 14. File map

| File | Change |
|---|---|
| `index.html` — panel (~L451) | New "Edge Data" section with 3 checkboxes |
| `index.html` — globals (~L494) | `edgeData`, `collect*` flags; rename from `edgePolarity` |
| `index.html` — `renderAdjacency()` edge block (~L613) | Read `edgeData`; badge pill for direction/polarity/magnitude; magnitude → stroke-width |
| `index.html` — edge popup (markup ~L475, JS ~L661) | Rows per enabled parameter; direction row with term labels |
| `index.html` — `adjacentTermPairs()` (~L948) | Attach `polarity` / `weight` / direction; apply the direction drop + duplicate rules |
| `index.html` — `btnExportCSV` (~L965) | Column set from `collect*`; direction ordering |
| `index.html` — `btnSave` (~L979) | `dimensions` block; `weight`; direction ordering |
| `index.html` — `loadBeeData()` (~L1090) | Reset + repopulate `edgeData`; apply `dimensions`; sync checkboxes |
| `index.html` — `demo()` (~L1131) | New assertions |
| `docs/apiary-output-specification.md` | §3.5, §4, §7, §8, changelog |
| `CLAUDE.md` | Globals list, Key Functions, Import/Export, Project Context |

All application changes remain confined to the single-file SPA. No build step, no
dependencies. Verification is `demo()` + manual browser check.
