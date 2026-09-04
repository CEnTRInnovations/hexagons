# Switch icon system from Material Symbols to Iconify (`mdi`)

**Status:** approved, ready for implementation planning
**Supersedes:** the icon *rendering* portion of [2026-08-29-idon-icon-suggestions-design.md](2026-08-29-idon-icon-suggestions-design.md) (that spec's suggestion architecture — alias map + local semantic corpus — is kept and repointed, not replaced)

## Motivation

Apiary's hexagon icons currently come from the Material Symbols Outlined webfont (~2,500 icons). Facilitators regularly place hexagons labeled with abstract CE-R vocabulary ("power dynamics," "reciprocity," "lived experience") that has no good match in that set. The fix isn't a better matcher — it's a bigger well of icons to match into. [Iconify](https://iconify.design/docs/api/) aggregates 200+ open icon sets (100,000+ icons total) behind one free public API, with no self-hosting cost or infrastructure to run.

Icon values are **not persisted** anywhere today (no `localStorage`, and `.bee`/CSV export never carry the `icon` field — see `adjacentTermPairs()` / `loadBeeData()` in [CLAUDE.md](../../../CLAUDE.md)). This is therefore a pure forward swap: no migration path, no legacy-value handling, nothing written to disk that needs to keep working.

## Decision: single set, `mdi` (Material Design Icons)

Iconify supports querying across all sets at once, but mixing icon styles within one app reads as inconsistent, which conflicts with Apiary's deliberate design system. Apiary standardizes on **one** cohesive set: `mdi` — ~7,500 icons, single visual style, MIT licensed, actively maintained, closest mental model to what the app has today. The prefix lives in one place (a constant), so swapping to a different set later is a config change plus a corpus regeneration, not a rewrite.

## Hosting: public API, not self-hosted

GitHub Pages is static-only — there's no way to run Iconify's actual API server. The only form of "self-hosting" available is committing a curated icon-set JSON bundle into the repo, which is premature: the app doesn't have traffic or icon-usage data yet to know what to curate, and the full `mdi` set alone is multiple MB. The public API (`api.iconify.design`) is free, keyless, rate-limit-free for normal use, explicitly supported for production, and Cloudflare-fronted with redundant infrastructure. Apiary already depends on third-party CDNs for fonts (Google Fonts) and the icon-suggestion runtime (jsdelivr, huggingface.co); one more fetch-only dependency doesn't change the app's availability or privacy posture. Revisit self-hosting only if steady traffic, offline requirements, and privacy (icon names + viewer IP reaching a third party) become real constraints together — none apply today.

## Data model

`h.icon` (and the `newIcon` global) changes from a bare Material Symbol ligature string (`"handshake"`) to Iconify's canonical `"prefix:name"` form (`"mdi:handshake"`). Self-describing and forward-compatible if a second set is ever added. No other field changes.

## Rendering

### Canvas hexagons

`renderHex()` currently draws the icon as an SVG `<text>` element using the Material Symbols Outlined font and a ligature string (`ic.textContent = h.icon`). This is replaced with a nested `<svg viewBox="0 0 W H">` positioned/sized exactly where the `<text>` element is today (`iconSize = h.size * 0.42`, same stack layout with the label lines below it), whose `innerHTML` is the icon's `body` path data with `fill="currentColor"` so it inherits the existing light/dark hex text-color logic (`isLight(h.color)`).

### UI chrome (toolbar + picker glyphs)

Five fixed, known-at-build-time glyphs (`file_open`, `save`, `download`, `add`/`+`, `close`) are inlined as static `<svg>` markup directly in the HTML, sourced once from `mdi` (e.g. `mdi:folder-open-outline`, `mdi:content-save-outline`, `mdi:download`, `mdi:plus`, `mdi:close`). These never change at runtime, so there's no reason to fetch or cache them — same reasoning that already governs `assets/logo.png` as a static local asset. This also fully removes the Material Symbols webfont dependency (the `<link>` at the top of `<head>` and all `.material-symbols-outlined` / `font-feature-settings: 'liga'` CSS).

### Fetch + cache for dynamic icons

Canvas and picker icons are chosen at runtime and can't be known ahead of time, so their SVG bodies come from the Iconify API on demand: `GET https://api.iconify.design/mdi.json?icons=name1,name2,...` (batched — one request per set of new names, not one per icon) returns `{ icons: { name: { body, width?, height? } }, width, height }`.

`renderHex()` and the picker are called synchronously and frequently (drag, typing), but the fetch is async. This is handled with a module-level `_iconCache` (`Map<"mdi:name", {body,width,height}>`) that mirrors the existing `iconEngineState`/`onIconEngineChange` pattern already used for the suggestion engine:

- A lookup for an uncached icon returns `null` immediately (that render pass shows no icon glyph — label-only), and queues the name into a pending batch fetch.
- The batch fetch resolves, populates `_iconCache`, persists it to `localStorage` (so a returning viewer doesn't refetch icons they've already seen), and calls `render()` again so the now-cached icon appears.
- A lookup for a cached icon returns its data synchronously — no network, no flicker, on every subsequent render.

### Failure / offline behavior

Same shape as the existing `iconEngineState` degradation, extended to icon *rendering* (previously only *suggestions* needed network):

- Suggestion engine (embedding model) unreachable → unchanged from today: "unavailable" message in the picker; the alias map still works fully offline since it's local data requiring no fetch.
- An icon's SVG body unreachable and not yet cached → the hex/picker renders label-only, exactly as a hex with no icon does today. Once an icon is cached once, it's durable offline from then on for that browser.

## Suggestion engine

Architecture is unchanged, just repointed:

- `tools/fetch-icon-catalog.mjs` swaps its source from Google's Material Symbols metadata endpoint to Iconify's `mdi` collection data (icon names + categories via `https://api.iconify.design/collection?prefix=mdi`, or equivalent). `build-icon-embeddings.mjs` and the MiniLM embedding pipeline (`@huggingface/transformers`, lazy-loaded from jsdelivr on first suggestion request) are untouched.
- Regenerate `vendor/icon-names.json` + `vendor/icon-vectors.bin` against the ~7,500-icon `mdi` catalog. Still lazy-loaded, still fails closed identically to today. Update `vendor/README.md`'s regeneration instructions to reference the new source.
- `iconDemo()` keeps validating against the local offline corpus only (no network in `#test`, so the self-check stays fast and CI-safe): every `ICON_ALIASES` value is a real name in the regenerated corpus, the alias short-circuit still works, suggestion count/floor behavior holds on the existing sample cases.

### `ICON_ALIASES` remap — the real cost of this project

Material Symbols uses `snake_case` names (`volunteer_activism`); `mdi` uses hyphenated, differently-scoped names (`hand-heart`, `charity`, …) with no mechanical 1:1 mapping. All ~150 entries (~300 icon values) need a human to re-pick the best `mdi` equivalent for each CE-R term. This curation is the bulk of the actual effort in this project — the code changes around it are comparatively small.

## Icon picker: manual search

Today `mountIconPicker` only ever shows the current icon plus up to 3 auto-suggestions (alias hit or embedding top-3). With `mdi`'s ~7,500 icons, that surfaces a sliver of the library — most of it is only reachable if the top-3 happens to guess right, which under-delivers on "bigger vocabulary" as the actual goal.

Add a search box to the picker: a text input wired to `https://api.iconify.design/search?query={q}&prefix=mdi&limit=32`, rendering a grid of real glyphs (via the same batched fetch-and-cache path as canvas rendering, not icon-name text) below the existing 3 auto-suggestions. Auto-suggestions stay as the fast path; search is additive, not a replacement, and uses the same `_iconCache`.

## What's deleted / kept

**Deleted:** Material Symbols Outlined webfont `<link>` and its CSS.

**Kept, repointed:** `tools/` regeneration scripts, `vendor/` corpus (regenerated), `ICON_ALIASES` (remapped), `mountIconPicker`, `iconEngineState`/`onIconEngineChange` machinery, `iconDemo()`.

**New:** `_iconCache` + batched-fetch rendering path, the 5 inlined chrome SVGs, the picker search box.

## Documentation updates

`CLAUDE.md`'s Tech Stack section needs its Dependencies line updated: replace the Material Symbols Google Fonts entry with `mdi` via Iconify, and add `api.iconify.design` as a runtime dependency for icon rendering + search (parallel to the existing jsdelivr/huggingface.co note for the suggestion engine, but now load-bearing for basic rendering rather than an optional enhancement). `vendor/README.md` needs its catalog-source description updated to point at Iconify's `mdi` collection instead of Google's Material Symbols metadata endpoint.

## Testing

- `iconDemo()` — updated assertions as described above, still offline/CI-safe.
- `demo()` / `#test` — no change to its own assertions, but exercises `renderHex()` so it should be checked that a hex with an icon still renders without throwing when the icon is uncached (label-only path) and when cached (synchronous path), ideally via a fake/pre-seeded `_iconCache` entry rather than a real network call in the self-check.
- Manual verification: place a hex, request a suggestion for a curated term (e.g. "trust") and confirm it resolves to a sensible `mdi` icon; try the new search box with a term outside the alias map; reload with dev tools offline to confirm previously-seen icons still render from cache and new ones degrade to label-only without errors.
