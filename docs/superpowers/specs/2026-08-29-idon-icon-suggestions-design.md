# Idon icon suggestions — design

**Status:** draft / experimental
**Date:** 2026-08-29
**Branch:** `claude/fusejs-material-icon-suggestions-83d63c`
**Author:** Jeremy Price + Claude

---

## Motivation

Hodgson's hexagon method (Hodgson 1992, *Hexagons for Systems Thinking*, EJSD 59:1)
names the atomic unit of dynamic representation an **idon** — "idea plus icon"
(p.9). Each labelled hexagon becomes an idon when its verbal headline is paired
with a visual symbol, giving facilitators a second, non-verbal channel for
scanning and clustering a map.

Apiary today renders hexes as **text only**. This feature adds an optional
Material Symbol icon per hex, suggested automatically from the hex's label via
semantic similarity, so a facilitator can accept a symbol with one tap rather
than hunting a 3600-icon catalogue.

This is an **exploration on this branch**, not a committed change to the
production single-file app. It knowingly breaks three constraints in
`CLAUDE.md` ("no build system", "no JavaScript libraries", "Google Fonts
only") because semantic matching of open-text labels is not possible without an
embedding model somewhere in the pipeline. Whether it merges to `main` is a
separate decision to be made after trying it in a real session.

## Goals

- Suggest 5 Material Symbol icons for a hex from its free-text label, ranked by
  semantic similarity (not fuzzy string match).
- Work for arbitrary label text — there is no fixed CE-R vocabulary file.
- Leave the base app (load, drag, cluster, export) unchanged in behaviour and
  in initial page weight until a suggestion is actually requested.
- Facilitator always picks; the tool never auto-applies an icon.

## Non-goals

- Persisting or exporting the icon. `.bee` and CSV stay edge-only per the
  interchange spec (`docs/apiary-output-specification.md`, `bee-file-spec.json`
  in apiary-hive). The icon lives only in the in-memory session.
- Icons affecting adjacency, clustering, or any analysis.
- Hand-curating the icon set (deferred — see Future work).
- Offline/PWA behaviour beyond what transformers.js caches for free.

## Approaches considered

1. **Fuse.js + hand-written keyword→icon table** (rejected earlier). Fuse only
   does fuzzy string matching; the intelligence would live entirely in a
   synonym table we'd have to author and maintain. Abstract labels
   ("epistemic justice") never match.
2. **Precompute the whole `{term: icon}` mapping offline** for a fixed
   vocabulary (rejected). Requires a canonical term list; Apiary labels are
   open text, so this whiffs constantly and degrades to fuzzy matching.
3. **Hosted embedding API at runtime** (rejected). Needs an API key in a static
   site, sends facilitator labels to a third party, and adds a hard network
   dependency.
4. **In-browser embedding model + precomputed icon corpus** (chosen). Embed the
   ~1500-icon corpus offline; embed the label at runtime with a small model
   (transformers.js). Works for any label. Cost: a one-time ~6 MB model
   download, browser-cached thereafter.

## Architecture

```
[offline, one-time]              [in repo, static]            [runtime, lazy]
tools/build-icon-embeddings.mjs  vendor/icon-vectors.bin      import transformers.js (CDN)
  fetch Google Fonts metadata  → vendor/icon-names.json     → model auto-fetched (huggingface.co)
  filter + embed + quantize                                 → embed(label)
                                                            → cosine vs matrix → top 5 icons
```

transformers.js and the MiniLM model are **not vendored** — they load from CDN
(`cdn.jsdelivr.net` + `huggingface.co`) on the first suggestion request.

The runtime model and corpus load **only on first suggestion request**, not on
page load.

## Components

### C1 — `tools/build-icon-embeddings.mjs` (offline dev tool)

Committed to the repo, never on the runtime path. Re-run manually to refresh
the icon set.

- **Input:** Google Fonts icon metadata, fetched once from
  `https://fonts.google.com/metadata/icons` (returns JSON: per icon `name`,
  `categories`, `tags`). `tags` are hand-authored synonyms
  (e.g. `delete` → `bin, can, garbage, remove, trash`).
- **Filter** (programmatic only, no manual curation):
  - drop icons whose `tags` contain both `logo` and `brand` (case-insensitive) —
    i.e. brand/logo marks only; the `Social` category is deliberately KEPT
    (`groups`, `share`, `diversity_3` are top hits for facilitation vocabulary)
  - drop icons with an empty `tags` array
  - no category-based filtering
  - expected result ≈ 4214 icons. (The earlier "≈ 1500" estimate assumed
    fill-variant dedup that this data source doesn't need, plus the now-retained
    `social` category.)
- **Embed:** for each icon, build the string
  `"{name humanised}. {tags joined by ', '}. {categories joined by ', '}"`
  and embed with `Xenova/all-MiniLM-L6-v2` (384-dim). Run transformers.js
  under Node.
- **Quantize:** L2-normalise each vector, then int8 with a single global scale
  factor. Record the scale in `icon-names.json`.
- **Output:**
  - `vendor/icon-vectors.bin` — `Int8Array`, row-major, `N × 384`
    (≈ 1500 × 384 B ≈ 570 KB)
  - `vendor/icon-names.json` — `{ model, dim, count, scale, names: [...] }`
    (order matches the `.bin` rows)

Model choice is MiniLM-L6 for size (~6 MB q8). `bge-small-en-v1.5` is a
drop-in upgrade for quality at ~2× params if MiniLM proves too weak — it only
changes the `build` script's model id and requires re-running the build.

### C2 — Runtime library (CDN)

- transformers.js is imported at runtime from
  `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6` (version pinned
  in the import URL).
- The quantised MiniLM ONNX model + tokenizer files are auto-fetched by
  transformers.js from its default host, `huggingface.co`.
- The ONNX-Runtime WASM is fetched from the jsDelivr package.
- No env overrides — transformers.js uses its default remote hosts.
- All of this loads only on the first suggestion request. If any of it is
  unreachable, `_ensureIconEngine()` hits its timeout/catch and the feature
  enters the `failed` state; the rest of the app is unaffected. Once loaded, the
  browser HTTP cache serves the model on subsequent requests without network.

### C3 — Runtime suggestion module (new code in `index.html`)

New IIFE / section in the existing single `<script>` block. State:

- `iconEngine` — lazily-initialised singleton holding the loaded pipeline,
  the dequantised `Float32Array` corpus matrix, and `icon-names.json`.
- `iconEngine.ready` — a promise; `null` until first request.

Flow:

1. **Trigger:** in `renderSelectedEditor()`, after the Text `<input>`:
   - debounce label `input` events ~400 ms → request suggestions
   - also a small **"Suggest"** button for on-demand re-run (covers hexes
     loaded from `.bee`, and manual retry)
2. **First request:** `import()` transformers.js from the pinned jsDelivr URL,
   construct the feature-extraction pipeline (`{ dtype: 'q8' }`), fetch +
   dequantise `icon-vectors.bin`. Show a one-time "loading suggestions…" line
   in the panel. Cache everything on the singleton; the browser HTTP cache
   holds the CDN model/library across sessions.
3. **Each request:** embed the label string → L2-normalise → dot product
   against the corpus matrix (plain loop, ≈ 1500 × 384 ≈ 0.6 M mults,
   sub-millisecond) → argsort → top 5 names.
4. **Race handling:** tag each request with the current `selectedId` + label;
   ignore a resolved result if either changed while it was in flight.

### C4 — UI: suggestion row

Mirrors the existing colour-swatch row in `renderSelectedEditor()`.

- A `div.a-icon-suggestions` under the Text field: 5 spans
  `class="material-symbols-outlined"`, each the suggested glyph, tappable.
- Tap a glyph → `h.icon = name; render();`
- A trailing ✕ control → `delete h.icon; render();`
- States: empty (nothing yet), "loading suggestions…", "no strong match"
  (top score below a small threshold, e.g. cosine < 0.2), or the 5 glyphs.
- The currently-applied `h.icon` (if any) is marked active in the row, same as
  the active colour swatch.

### C5 — Data model + hex rendering

- **Data model:** new optional field on the hex object — `icon: String`
  (a Material Symbol name) — absent when unset. Add to the data-model table in
  `CLAUDE.md` once this leaves experimental status.
- **`renderHex(h)`:** when `h.icon` is set:
  - append one `<text class="material-symbols-outlined">` glyph, centred
    horizontally, in the upper third of the hex, `font-size ≈ h.size * 0.4`,
    `fill` = same `textColor` computation as the label
  - shift the wrapped label block down so icon + text stay vertically centred
    as a unit
  - `pointer-events: none` on the glyph, like the label text
  - when `h.icon` is absent, render exactly as today (no layout change)

## Data flow

```
label text
  → (debounce 400ms)
  → iconEngine.ready (first time: load lib + model + corpus)
  → pipeline(label)  → Float32Array[384], L2-normalised
  → dot product vs corpus matrix (N×384)
  → top-5 indices → names via icon-names.json
  → render 5 glyphs in panel
  → facilitator taps one → h.icon = name → render()
```

## Error handling

- **Model / library fails to load** (offline, blocked, WASM unsupported):
  catch, show "icon suggestions unavailable — needs an internet connection the
  first time" once in the panel, disable the Suggest button for the session.
  Base app unaffected. This is the expected path when the CDN is unreachable.
- **`icon-vectors.bin` fetch fails:** same treatment.
- **Embedding throws on a pathological label** (empty, whitespace, huge):
  guard — skip suggestion for empty/whitespace, truncate labels to ~200 chars
  before embedding.
- **Stale results:** dropped via the request-tag check in C3 step 4.
- **WebGPU present but broken:** transformers.js falls back to WASM; if that
  also fails, treat as load failure above.

## Testing

- **`tools/build-icon-embeddings.mjs`** — a `--self-check` mode (or a sibling
  `test-icon-embeddings.mjs`) that, after building, asserts a handful of known
  label→icon expectations by running the same dot-product path the browser
  uses: e.g. `"money"` → `payments`/`attach_money` in top 3; `"team"` →
  `groups` in top 3; `"warning"` → `warning`/`report` in top 3. Fails loudly
  if the corpus or quantisation regresses. `assert`-based, no framework.
- **Runtime matching** — a small `demo()` in the suggestion module, runnable
  from the console, that embeds 3–4 fixed strings and logs top-5, for manual
  spot-checking during development.
- **Rendering** — manual: add a hex, set `icon` via a suggestion, confirm the
  glyph renders in-hex in both light and dark hex colours, resize the hex,
  confirm label reflow.
- **Regression** — confirm page load with no suggestion request pulls zero new
  bytes beyond the base app (network tab), and that `.bee` / CSV export are
  byte-identical to before for a map with icons set.

## Rollout / where it lives

- All new files under `vendor/` and `tools/`; runtime code fenced in its own
  section of the `index.html` `<script>`.
- Lives on this branch. A merge-to-`main` decision comes after a real-session
  trial, and would need a `CLAUDE.md` update acknowledging the relaxed
  constraints (or a conscious decision to keep it branch-only / on a separate
  `idon.html`).

## Future work (explicitly deferred)

| Deferred | Revisit when |
|---|---|
| Hand-curated icon subset | suggestions feel noisy in real facilitation use |
| Icon carried into `.bee` / CSV export | idons are decided to carry downstream meaning — needs an apiary-hive spec change first |
| Larger model (bge-small / gte-small) | MiniLM suggestions prove too weak |
| Session-lossless persistence of `icon` | positions/colours are ever made to round-trip (see `CLAUDE.md` "Session-lossless save") |
| PWA / explicit model precaching | facilitators report slow first-loads on venue wifi |
| Auto-apply top suggestion | never — per Hodgson (p.6) meaning is not transferable by wording alone; the facilitator must choose |
