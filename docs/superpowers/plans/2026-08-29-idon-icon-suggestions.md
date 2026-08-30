# Idon Icon Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest 5 Material Symbol icons for a hexagon from its free-text label using in-browser semantic similarity, tappable to apply as an on-hex glyph.

**Architecture:** An offline Node script fetches Google Fonts icon metadata, filters it, and embeds each icon's name+synonyms with a small sentence-transformer (`Xenova/all-MiniLM-L6-v2`), writing a quantised vector blob into `vendor/`. At runtime the single-file app lazy-loads a vendored copy of transformers.js + the same model on first suggestion request, embeds the hex label, and ranks the precomputed icon vectors by dot product. The base app pulls zero new bytes until a suggestion is requested.

**Tech Stack:** Vanilla JS (existing `index.html`), `@huggingface/transformers` v3 (transformers.js), ONNX Runtime Web (WASM/WebGPU), Node 20+ for the build tool.

**Spec:** `docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md`

## Global Constraints

- **Experimental / branch-only.** Do not modify `CLAUDE.md`. This work knowingly relaxes its "no build system / no JS libraries / Google Fonts only" rules; that trade is confined to this branch.
- **Base app unchanged until used.** Page load with no suggestion request must fetch zero new bytes beyond today's app. All new runtime code and assets load via `import()` / `fetch()` only on the first suggestion request.
- **No export/persistence changes.** `.bee` and CSV export must be byte-identical for a map whose hexes have `icon` set. `adjacentTermPairs()`, `getAdjacent()`, `getClusters()` are not touched.
- **Model id is `Xenova/all-MiniLM-L6-v2`, dtype `q8`, 384-dim.** Same id and dtype in the build script and the runtime — a mismatch produces meaningless rankings.
- **Vectors:** L2-normalised then int8 with fixed `scale = 127` (dequant = `i / 127`). Blob is row-major `Int8Array`, `count × 384`, row order matching `icon-names.json`'s `names` array.
- **New files live in `tools/` and `vendor/`.** Runtime code is one new fenced section in the existing `<script>` block in `index.html`. `vendor/` is not gitignored; `docs/` is (force-add plan/spec files, as the repo already does).
- Commit after every task. Conventional-commit prefixes (`feat:`, `test:`, `chore:`).

---

### Task 1: Build-tool scaffold + metadata fetch and filter

**Files:**
- Create: `tools/package.json`
- Create: `tools/.gitignore`
- Create: `tools/fetch-icon-catalog.mjs`
- Create: `tools/test-fetch-icon-catalog.mjs`
- Create: `tools/fixtures/icons-sample.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildCatalog(rawMetadata) -> { names: string[], docs: string[] }` exported from `tools/fetch-icon-catalog.mjs`. `names[i]` is the Material Symbol name; `docs[i]` is the embedding input string for that icon. Arrays are parallel, sorted by `names`.
  - `parseMetadata(text) -> { icons: Array<{name, categories: string[], tags: string[]}> }` exported from the same file — strips the XSSI prefix and returns the parsed object.
  - Running `node tools/fetch-icon-catalog.mjs` writes `tools/build/icon-catalog.json` = `{ names, docs }`.

- [ ] **Step 1: Scaffold the Node package**

`tools/package.json`:
```json
{
  "name": "apiary-icon-embeddings",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "catalog": "node fetch-icon-catalog.mjs",
    "build": "node build-icon-embeddings.mjs",
    "vendor": "node vendor-model.mjs"
  },
  "dependencies": {
    "@huggingface/transformers": "3.7.6"
  }
}
```

`tools/.gitignore`:
```
node_modules/
build/
```

Run: `cd tools && npm install`
Expected: `node_modules/@huggingface/transformers` exists, no error.

- [ ] **Step 2: Write the failing test**

`tools/test-fetch-icon-catalog.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMetadata, buildCatalog } from './fetch-icon-catalog.mjs';

const RAW = readFileSync(new URL('./fixtures/icons-sample.json', import.meta.url), 'utf8');

test('parseMetadata strips the XSSI prefix and returns icons', () => {
  const md = parseMetadata(RAW);
  assert.ok(Array.isArray(md.icons));
  assert.ok(md.icons.length >= 5);
});

test('buildCatalog drops brand/social and tagless icons, keeps concrete ones', () => {
  const { names, docs } = buildCatalog(parseMetadata(RAW));
  assert.ok(names.includes('delete'));
  assert.ok(names.includes('groups'));
  assert.ok(!names.includes('android'), 'brand icon should be filtered');
  assert.ok(!names.includes('blank_icon_no_tags'), 'tagless icon should be filtered');
  assert.equal(names.length, docs.length);
  const i = names.indexOf('delete');
  assert.match(docs[i], /trash|garbage|bin/);
  // sorted, unique
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
});
```

`tools/fixtures/icons-sample.json` (the real endpoint prefixes the body with `)]}'` on its own line — reproduce that):
```
)]}'
{"icons":[
 {"name":"delete","categories":["action"],"tags":["bin","can","garbage","remove","trash"],"unsupported_families":[]},
 {"name":"groups","categories":["social"],"tags":["people","team","crowd","community"],"unsupported_families":[]},
 {"name":"android","categories":["brand"],"tags":["logo","robot"],"unsupported_families":[]},
 {"name":"facebook","categories":["social"],"tags":["logo"],"unsupported_families":[]},
 {"name":"blank_icon_no_tags","categories":["action"],"tags":[],"unsupported_families":[]},
 {"name":"home","categories":["action"],"tags":["house","building","address","main"],"unsupported_families":[]},
 {"name":"payments","categories":["action"],"tags":["money","cash","pay","credit","card","bill"],"unsupported_families":[]},
 {"name":"warning","categories":["alert"],"tags":["caution","danger","alert","exclamation","attention"],"unsupported_families":[]}
]}
```
Note the fixture keeps `groups` (category `social`) — the filter drops `social` **only when the icon also looks like a brand/logo**. Simpler rule that the test locks in: drop an icon if `categories` includes `brand`, OR every tag is one of `{logo, brand, social, network}`. `groups` survives; `android` and `facebook` do not.

Run: `cd tools && node --test test-fetch-icon-catalog.mjs`
Expected: FAIL — `Cannot find module './fetch-icon-catalog.mjs'`.

- [ ] **Step 3: Implement `fetch-icon-catalog.mjs`**

```js
import { writeFileSync, mkdirSync } from 'node:fs';

const ENDPOINT =
  'https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols';

const LOGO_TAGS = new Set(['logo', 'brand', 'social', 'network']);

export function parseMetadata(text) {
  // Google prefixes the JSON body with an XSSI guard line: )]}'
  const stripped = text.replace(/^\)\]\}'\s*/, '');
  return JSON.parse(stripped);
}

function humanize(name) {
  return name.replace(/_/g, ' ');
}

function isLogoLike(icon) {
  if ((icon.categories || []).includes('brand')) return true;
  const tags = icon.tags || [];
  return tags.length > 0 && tags.every((t) => LOGO_TAGS.has(t.toLowerCase()));
}

export function buildCatalog(metadata) {
  const seen = new Set();
  const rows = [];
  for (const icon of metadata.icons || []) {
    if (!icon.tags || icon.tags.length === 0) continue;
    if (isLogoLike(icon)) continue;
    if (seen.has(icon.name)) continue;
    seen.add(icon.name);
    const doc =
      `${humanize(icon.name)}. ${icon.tags.join(', ')}. ` +
      `${(icon.categories || []).join(', ')}`.trim();
    rows.push({ name: icon.name, doc });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: rows.map((r) => r.name), docs: rows.map((r) => r.doc) };
}

async function main() {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
  const catalog = buildCatalog(parseMetadata(await res.text()));
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

- [ ] **Step 4: Run the test**

Run: `cd tools && node --test test-fetch-icon-catalog.mjs`
Expected: PASS (both tests).

- [ ] **Step 5: Run the real fetch and sanity-check the count**

Run: `cd tools && node fetch-icon-catalog.mjs`
Expected: prints `wrote NNNN icons` where `NNNN` is between 1000 and 2600. If the fetch fails (network/endpoint change), fall back: `npm i -D @material-symbols/metadata` and adapt `main()` to read `@material-symbols/metadata` (`import meta from '@material-symbols/metadata'` → `meta.icons` with `.name` and `.tags`/`.categories`), keeping `buildCatalog` unchanged. Note the fallback in a code comment.

- [ ] **Step 6: Commit**

```bash
git add tools/package.json tools/.gitignore tools/fetch-icon-catalog.mjs tools/test-fetch-icon-catalog.mjs tools/fixtures/icons-sample.json
git commit -m "feat: fetch and filter Material Symbols catalog for embedding"
```

---

### Task 2: Embed the catalog and write the quantised vector blob

**Files:**
- Create: `tools/build-icon-embeddings.mjs`
- Create: `tools/test-icon-embeddings.mjs`
- Create (generated, commit): `vendor/icon-vectors.bin`
- Create (generated, commit): `vendor/icon-names.json`

**Interfaces:**
- Consumes: `tools/build/icon-catalog.json` = `{ names: string[], docs: string[] }` from Task 1.
- Produces:
  - `vendor/icon-names.json` = `{ model: "Xenova/all-MiniLM-L6-v2", dim: 384, count: N, scale: 127, names: string[] }`.
  - `vendor/icon-vectors.bin` = raw `Int8Array` bytes, length `N * 384`, row `i` = quantised L2-normalised embedding of `docs[i]`, same order as `names`.
  - `embedAll(docs) -> Float32Array` (length `docs.length * 384`, each row L2-normalised) exported from `build-icon-embeddings.mjs`.
  - `quantize(float32, scale) -> Int8Array` and `dequantizeRow(int8, offset, dim, scale) -> Float32Array` exported from the same file (the runtime reimplements `dequantize`; keeping a reference impl here lets the test check round-trip).

- [ ] **Step 1: Write the failing test**

`tools/test-icon-embeddings.mjs`:
```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { quantize, dequantizeRow } from './build-icon-embeddings.mjs';

test('quantize/dequantize round-trips within int8 resolution', () => {
  const v = Float32Array.from([0, 0.5, -0.5, 1, -1, 0.123]);
  const q = quantize(v, 127);
  const back = dequantizeRow(q, 0, v.length, 127);
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(v[i] - back[i]) < 1 / 127 + 1e-6);
});

// Integration: requires `npm run build` to have produced vendor/ artifacts.
test('built corpus ranks obvious labels correctly', { skip: !existsSync(new URL('../vendor/icon-vectors.bin', import.meta.url)) }, async () => {
  const meta = JSON.parse(readFileSync(new URL('../vendor/icon-names.json', import.meta.url), 'utf8'));
  const bin = new Int8Array(readFileSync(new URL('../vendor/icon-vectors.bin', import.meta.url)).buffer);
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });

  async function top(label, k = 5) {
    const out = await extractor(label, { pooling: 'mean', normalize: true });
    const q = out.data; // Float32Array(384), normalised
    const scores = [];
    for (let r = 0; r < meta.count; r++) {
      let dot = 0;
      for (let d = 0; d < meta.dim; d++) dot += q[d] * (bin[r * meta.dim + d] / meta.scale);
      scores.push([meta.names[r], dot]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    return scores.slice(0, k).map((s) => s[0]);
  }

  assert.ok((await top('money')).some((n) => /payment|money|cash|wallet|attach_money/.test(n)));
  assert.ok((await top('team')).some((n) => /group|people|diversity/.test(n)));
  assert.ok((await top('warning')).some((n) => /warning|report|error|priority_high/.test(n)));
});
```

Run: `cd tools && node --test test-icon-embeddings.mjs`
Expected: FAIL — `Cannot find module './build-icon-embeddings.mjs'`.

- [ ] **Step 2: Implement `build-icon-embeddings.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIM = 384;
export const SCALE = 127;

export function quantize(float32, scale) {
  const out = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let q = Math.round(float32[i] * scale);
    if (q > 127) q = 127;
    if (q < -128) q = -128;
    out[i] = q;
  }
  return out;
}

export function dequantizeRow(int8, offset, dim, scale) {
  const out = new Float32Array(dim);
  for (let d = 0; d < dim; d++) out[d] = int8[offset + d] / scale;
  return out;
}

export async function embedAll(docs) {
  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const all = new Float32Array(docs.length * DIM);
  const BATCH = 64;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const out = await extractor(slice, { pooling: 'mean', normalize: true });
    all.set(out.data, i * DIM);
    if (i % 512 === 0) console.log(`embedded ${i}/${docs.length}`);
  }
  return all;
}

async function main() {
  const catalog = JSON.parse(
    readFileSync(new URL('./build/icon-catalog.json', import.meta.url), 'utf8'),
  );
  const floats = await embedAll(catalog.docs);
  const bytes = quantize(floats, SCALE);
  writeFileSync(new URL('../vendor/icon-vectors.bin', import.meta.url), Buffer.from(bytes.buffer));
  writeFileSync(
    new URL('../vendor/icon-names.json', import.meta.url),
    JSON.stringify({
      model: MODEL, dim: DIM, count: catalog.names.length, scale: SCALE, names: catalog.names,
    }),
  );
  console.log(`wrote vendor/icon-vectors.bin (${bytes.length} bytes) + icon-names.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Run the unit test (round-trip only)**

Run: `cd tools && node --test test-icon-embeddings.mjs`
Expected: PASS for the round-trip test; the integration test reports as `skipped` (no `vendor/icon-vectors.bin` yet).

- [ ] **Step 4: Build the real corpus**

Run: `cd tools && node build-icon-embeddings.mjs`
Expected: prints progress, ends with `wrote vendor/icon-vectors.bin (NNNNNN bytes)`. `NNNNNN` ≈ `count * 384`, so ~400 KB–1 MB. First run downloads the model to the HF cache (~6 MB).

- [ ] **Step 5: Run the full test (now with integration)**

Run: `cd tools && node --test test-icon-embeddings.mjs`
Expected: PASS for all three tests. If a `top()` assertion fails, widen its regex to the actual top-5 you see printed and note in a comment why — do not loosen to always-pass.

- [ ] **Step 6: Commit**

```bash
git add tools/build-icon-embeddings.mjs tools/test-icon-embeddings.mjs vendor/icon-vectors.bin vendor/icon-names.json
git commit -m "feat: build quantised Material Symbols embedding corpus"
```

---

### Task 3: Vendor transformers.js + the model for offline runtime use

> **SUPERSEDED** — the vendored-binary approach was replaced by runtime CDN loading (see the design spec's C2). This task's files (vendor/transformers/, tools/vendor-model.mjs, tools/test-vendored-runtime.mjs) were removed.

**Files:**
- Create: `tools/vendor-model.mjs`
- Create: `vendor/transformers/README.md`
- Create (vendored, commit): `vendor/transformers/transformers.min.js`
- Create (vendored, commit): `vendor/transformers/*.wasm`, `vendor/transformers/ort-*.mjs` (ONNX Runtime Web assets)
- Create (vendored, commit): `vendor/transformers/models/Xenova/all-MiniLM-L6-v2/{config.json,tokenizer.json,tokenizer_config.json,onnx/model_quantized.onnx}`
- Create: `tools/test-vendored-runtime.mjs`

**Interfaces:**
- Consumes: `@huggingface/transformers` in `tools/node_modules` (Task 1), the HF model cache populated in Task 2.
- Produces: a self-contained `vendor/transformers/` such that a browser can `import('./vendor/transformers/transformers.min.js')`, set `env.allowRemoteModels = false`, `env.localModelPath = './vendor/transformers/models/'`, `env.backends.onnx.wasm.wasmPaths = './vendor/transformers/'`, and load `Xenova/all-MiniLM-L6-v2` with `{ dtype: 'q8' }` offline.

- [ ] **Step 1: Write `vendor-model.mjs`**

```js
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const distDir = join(require.resolve('@huggingface/transformers'), '..'); // dist/
const outDir = new URL('../vendor/transformers/', import.meta.url);
const outModelDir = new URL(
  '../vendor/transformers/models/Xenova/all-MiniLM-L6-v2/',
  import.meta.url,
);

mkdirSync(outDir, { recursive: true });
mkdirSync(outModelDir, { recursive: true });

// 1. The library bundle + every wasm / ort asset next to it.
for (const f of readdirSync(distDir)) {
  if (f === 'transformers.min.js' || /\.wasm$/.test(f) || /^ort-.*\.mjs$/.test(f)) {
    cpSync(join(distDir, f), new URL(f, outDir), { recursive: true });
  }
}

// 2. The model files from the HF cache populated by `npm run build`.
const cacheRoot = join(
  homedir(),
  '.cache/huggingface/hub/models--Xenova--all-MiniLM-L6-v2/snapshots',
);
if (!existsSync(cacheRoot)) {
  throw new Error('model not in HF cache — run `node build-icon-embeddings.mjs` first');
}
const snap = join(cacheRoot, readdirSync(cacheRoot)[0]);
for (const rel of [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
]) {
  mkdirSync(join(outModelDir.pathname, rel, '..'), { recursive: true });
  cpSync(join(snap, rel), join(outModelDir.pathname, rel));
}
console.log('vendored transformers.js + all-MiniLM-L6-v2 into vendor/transformers/');
```

- [ ] **Step 2: Run it**

Run: `cd tools && node vendor-model.mjs`
Expected: `vendor/transformers/transformers.min.js`, at least one `.wasm`, and `vendor/transformers/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx` all exist.
If `model_quantized.onnx` is absent from the cache, the model repo names it `model.onnx` under a quantized subfolder — inspect `readdirSync(join(snap,'onnx'))` and copy whichever quantised file exists, updating the `rel` list and noting it in `vendor/transformers/README.md`.

- [ ] **Step 3: Write the offline-load test**

`tools/test-vendored-runtime.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('vendored model loads with remote fetch disabled', async () => {
  const { pipeline, env } = await import(
    new URL('../vendor/transformers/transformers.min.js', import.meta.url)
  );
  env.allowRemoteModels = false;
  env.localModelPath = new URL('../vendor/transformers/models/', import.meta.url).pathname;
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  const out = await extractor('hello world', { pooling: 'mean', normalize: true });
  assert.equal(out.data.length, 384);
  let norm = 0;
  for (const x of out.data) norm += x * x;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-3, 'output should be L2-normalised');
});
```

Run: `cd tools && node --test test-vendored-runtime.mjs`
Expected: PASS with no network access (disable wifi to be sure, or trust `allowRemoteModels = false`).

- [ ] **Step 4: Write `vendor/transformers/README.md`**

```markdown
# Vendored transformers.js runtime

Do not edit by hand. Regenerate with:

    cd tools && npm install && npm run build && npm run vendor

- `transformers.min.js` + `*.wasm` + `ort-*.mjs` — @huggingface/transformers 3.7.6 dist
- `models/Xenova/all-MiniLM-L6-v2/` — q8 ONNX model + tokenizer, from the HF hub cache

Pinned so the app has no runtime CDN dependency. Bump the version in
`tools/package.json`, reinstall, and rerun the commands above to update.
```

- [ ] **Step 5: Commit**

```bash
git add tools/vendor-model.mjs tools/test-vendored-runtime.mjs vendor/transformers
git commit -m "chore: vendor transformers.js and all-MiniLM-L6-v2 for offline runtime"
```

---

### Task 4: Runtime suggestion engine in `index.html`

**Files:**
- Modify: `index.html` — add one new fenced section at the end of the `<script>` block (before the final `</script>`), after `renderSelectedEditor()` and friends. The existing script starts at `index.html:450`.

**Interfaces:**
- Consumes: `vendor/icon-names.json`, `vendor/icon-vectors.bin`, `vendor/transformers/transformers.min.js` (all fetched lazily).
- Produces (globals in the script scope, used by Task 5):
  - `async function suggestIcons(label) -> string[]` — returns up to 5 Material Symbol names ranked by similarity, or `[]` for empty/whitespace input or if `iconEngineState === 'failed'`. First call triggers the load.
  - `let iconEngineState` — one of `'idle' | 'loading' | 'ready' | 'failed'`.
  - `function onIconEngineChange(cb)` — registers a 0-arg callback fired whenever `iconEngineState` changes (so the panel can re-render its loading line).
  - `const ICON_SCORE_FLOOR = 0.2` — top score below this ⇒ Task 5 shows "no strong match".
  - `iconDemo()` — console helper (see Step 4).

- [ ] **Step 1: Add the engine section — write it**

Insert before `</script>` in `index.html`:
```js
// ─── Idon icon suggestions (experimental, lazy-loaded) ────────────────────────
const ICON_SCORE_FLOOR = 0.2;
let iconEngineState = 'idle';
const _iconEngineCbs = [];
function onIconEngineChange(cb) { _iconEngineCbs.push(cb); }
function _setIconEngineState(s) {
  iconEngineState = s;
  _iconEngineCbs.forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
}

let _iconEngine = null;      // { extract, names, matrix: Float32Array, count, dim }
let _iconEngineReady = null; // Promise

async function _loadIconEngine() {
  const base = new URL('.', document.baseURI);
  const { pipeline, env } = await import(new URL('vendor/transformers/transformers.min.js', base));
  env.allowRemoteModels = false;
  env.localModelPath = new URL('vendor/transformers/models/', base).href;
  env.backends.onnx.wasm.wasmPaths = new URL('vendor/transformers/', base).href;

  const meta = await fetch(new URL('vendor/icon-names.json', base)).then(r => {
    if (!r.ok) throw new Error('icon-names.json ' + r.status);
    return r.json();
  });
  const buf = await fetch(new URL('vendor/icon-vectors.bin', base)).then(r => {
    if (!r.ok) throw new Error('icon-vectors.bin ' + r.status);
    return r.arrayBuffer();
  });
  const raw = new Int8Array(buf);
  const matrix = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) matrix[i] = raw[i] / meta.scale;

  const extract = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });
  _iconEngine = { extract, names: meta.names, matrix, count: meta.count, dim: meta.dim };
}

function _ensureIconEngine() {
  if (!_iconEngineReady) {
    _setIconEngineState('loading');
    _iconEngineReady = _loadIconEngine()
      .then(() => _setIconEngineState('ready'))
      .catch(err => { console.error('icon engine failed', err); _setIconEngineState('failed'); throw err; });
  }
  return _iconEngineReady;
}

async function suggestIcons(label) {
  const text = (label || '').trim().slice(0, 200);
  if (!text) return [];
  try { await _ensureIconEngine(); } catch { return []; }
  const e = _iconEngine;
  const out = await e.extract(text, { pooling: 'mean', normalize: true });
  const q = out.data; // Float32Array(dim), normalised
  let best = []; // [score, index] kept as top-5, ascending by score
  for (let r = 0; r < e.count; r++) {
    let dot = 0;
    const off = r * e.dim;
    for (let d = 0; d < e.dim; d++) dot += q[d] * e.matrix[off + d];
    if (best.length < 5) {
      best.push([dot, r]);
      if (best.length === 5) best.sort((a, b) => a[0] - b[0]);
    } else if (dot > best[0][0]) {
      best[0] = [dot, r];
      best.sort((a, b) => a[0] - b[0]);
    }
  }
  return best.sort((a, b) => b[0] - a[0]).map(([, r]) => e.names[r]);
}
```

- [ ] **Step 2: Verify the base app still loads with zero new requests**

Run: serve the folder — `cd .. && python3 -m http.server 8777` — open `http://localhost:8777/`, open DevTools Network tab, reload.
Expected: no request to `vendor/` anything. Add/drag/select a hex — still no `vendor/` request (Task 5 wires the trigger). App behaves exactly as before.

- [ ] **Step 3: Manually exercise `suggestIcons` from the console**

In the page console:
```js
await suggestIcons('community partnership')
```
Expected: first call — Network tab shows `transformers.min.js`, a `.wasm`, `model_quantized.onnx`, `icon-names.json`, `icon-vectors.bin` loading; resolves to an array of 5 plausible icon names (e.g. `handshake`, `groups`, `diversity_3`). `iconEngineState` is `'ready'`. Second call resolves fast with no new model download.

- [ ] **Step 4: Add and run the `iconDemo` self-check**

Append to the section:
```js
async function iconDemo() {
  const cases = [
    ['money', /payment|money|cash|wallet|savings|attach_money/],
    ['team', /group|people|diversity/],
    ['warning', /warning|report|error|priority_high/],
    ['', null],
  ];
  for (const [label, re] of cases) {
    const got = await suggestIcons(label);
    const ok = re ? got.some(n => re.test(n)) : got.length === 0;
    console[ok ? 'log' : 'error'](ok ? 'PASS' : 'FAIL', JSON.stringify(label), got);
    console.assert(ok, `iconDemo case failed: ${label}`);
  }
}
```
Run `await iconDemo()` in the console.
Expected: four `PASS` lines, no `FAIL`, no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: lazy-loaded semantic icon suggestion engine"
```

---

### Task 5: Suggestion row in the Selected Hex editor

**Files:**
- Modify: `index.html` — `renderSelectedEditor()` at `index.html:667-708`; add CSS to the design-system `<style>` block (near the `.a-swatches` rules).

**Interfaces:**
- Consumes: `suggestIcons`, `iconEngineState`, `onIconEngineChange`, `ICON_SCORE_FLOOR` from Task 4; the `hexes` array and `render()` from the existing script.
- Produces: sets `h.icon` (string) / deletes it on the selected hex object; calls `render()`. No new exported symbols.

- [ ] **Step 1: Add CSS**

In the `<style>` block with the other `.a-*` rules:
```css
.a-icon-suggestions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0.25rem 0 0.75rem; min-height: 28px; }
.a-icon-suggestions .material-symbols-outlined { font-size: 22px; padding: 3px; border-radius: 6px; cursor: pointer; color: var(--text); background: var(--bg-main); border: 1px solid transparent; }
.a-icon-suggestions .material-symbols-outlined:hover { border-color: var(--primary); }
.a-icon-suggestions .material-symbols-outlined.active { border-color: var(--primary); background: var(--bg-mid); }
.a-icon-suggestions .a-icon-clear { cursor: pointer; font-size: 18px; color: var(--serve); }
.a-icon-suggestions .a-muted { font-size: 0.85rem; color: var(--text); opacity: 0.6; }
.a-icon-suggest-btn { font: inherit; font-size: 0.8rem; padding: 2px 8px; border: 1px solid var(--primary); background: var(--bg-main); color: var(--primary); border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 2: Wire the row into `renderSelectedEditor()`**

Immediately after the block that appends `textRow` (the `div.appendChild(textRow);` line, ~`index.html:684`), insert:
```js
  // ── Icon suggestions (idon) ──
  const iconWrap = document.createElement('div');
  iconWrap.className = 'a-icon-suggestions';
  div.appendChild(iconWrap);

  let iconReqToken = 0;
  function paintIcons(list) {
    iconWrap.innerHTML = '';
    if (iconEngineState === 'loading') {
      const s = document.createElement('span');
      s.className = 'a-muted'; s.textContent = 'loading suggestions…';
      iconWrap.appendChild(s); return;
    }
    if (iconEngineState === 'failed') {
      const s = document.createElement('span');
      s.className = 'a-muted'; s.textContent = 'icon suggestions unavailable';
      iconWrap.appendChild(s); return;
    }
    if (h.icon) {
      const cur = document.createElement('span');
      cur.className = 'material-symbols-outlined active';
      cur.textContent = h.icon; cur.title = h.icon;
      iconWrap.appendChild(cur);
    }
    (list || []).forEach(name => {
      if (name === h.icon) return;
      const g = document.createElement('span');
      g.className = 'material-symbols-outlined';
      g.textContent = name; g.title = name;
      g.addEventListener('click', () => { h.icon = name; render(); });
      iconWrap.appendChild(g);
    });
    if (h.icon) {
      const x = document.createElement('span');
      x.className = 'material-symbols-outlined a-icon-clear';
      x.textContent = 'close'; x.title = 'Remove icon';
      x.addEventListener('click', () => { delete h.icon; render(); });
      iconWrap.appendChild(x);
    }
    if (!list || !list.length) {
      const b = document.createElement('button');
      b.className = 'a-icon-suggest-btn'; b.textContent = 'Suggest icon';
      b.addEventListener('click', () => runIconSuggest());
      iconWrap.appendChild(b);
    }
  }

  async function runIconSuggest() {
    const token = ++iconReqToken;
    const label = h.text;
    paintIcons(null); // shows button or loading line
    const list = await suggestIcons(label);
    if (token !== iconReqToken || selectedId !== h.id || h.text !== label) return;
    paintIcons(list.length ? list : []);
  }

  onIconEngineChange(() => { if (selectedId === h.id) paintIcons(null); });
  paintIcons(null);

  // debounce label edits → refresh suggestions once the engine has been used
  tInput.addEventListener('input', () => {
    clearTimeout(tInput._iconTimer);
    tInput._iconTimer = setTimeout(() => {
      if (iconEngineState === 'ready') runIconSuggest();
    }, 400);
  });
```
Note: the existing `tInput` handler (`tInput.addEventListener('input', () => { h.text = tInput.value; render(); })`) already calls `render()` on every keystroke, which rebuilds this editor. That means our debounced timer is attached to a fresh `tInput` each keystroke and never fires. Fix: in the existing handler, stop calling full `render()` on each keystroke — replace it with updating just the hex text nodes. Change the existing handler to:
```js
    tInput.addEventListener('input', () => { h.text = tInput.value; renderCanvasOnly(); });
```
and add near `render()`:
```js
function renderCanvasOnly() {
  gHex.innerHTML = '';
  hexes.forEach(h => gHex.appendChild(renderHex(h)));
  renderGrid();
  renderAdjacency();
}
```
This keeps the editor DOM (and our debounce timer) stable while typing; `render()` still runs on selection change, colour, icon pick, delete.

- [ ] **Step 3: Manual test — apply an icon**

Serve and open the app. Add a hex, type `funding`, select it. Click **Suggest icon**.
Expected: "loading suggestions…" appears, then a row of 5 glyphs. Click one → it renders on the hex (Task 6) and shows as `active` with a `close` control. Click `close` → icon removed.

- [ ] **Step 4: Manual test — debounce on edit**

With the engine already loaded (from Step 3), select a hex and edit its label to `security`.
Expected: ~400 ms after you stop typing, the suggestion row refreshes to security-ish icons (`lock`, `shield`, `security`). No refresh mid-keystroke.

- [ ] **Step 5: Manual test — weak match**

Type a label with no icon concept, e.g. `asdfqwer`. Click Suggest.
Expected: top score below `ICON_SCORE_FLOOR` ⇒ row shows "no strong match" instead of 5 glyphs. (Implement: in `runIconSuggest`, if `suggestIcons` returned names but you want the floor check, have `suggestIcons` also expose the top score — simplest: change `suggestIcons` to return `[]` when top dot `< ICON_SCORE_FLOOR`, and in `paintIcons` show a "no strong match" `a-muted` span when `list` is an empty array *and* `h.text.trim()` is non-empty. Update Task 4 Step 1 accordingly.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: icon suggestion row in the selected-hex editor"
```

---

### Task 6: Render the icon on the hex

**Files:**
- Modify: `index.html` — `renderHex(h)` at `index.html:605-656` (the text-layout block, `index.html:634-651`).

**Interfaces:**
- Consumes: `h.icon` (string | undefined) on the hex object.
- Produces: nothing new; changes SVG output of `renderHex` when `h.icon` is set.

- [ ] **Step 1: Add the glyph + reflow the label**

Replace the label-rendering block (from `const lines = wrapText(...)` through the `lines.forEach(...)` loop) with:
```js
  const hasIcon = !!h.icon;
  const iconSize = hasIcon ? h.size * 0.42 : 0;
  const lines = wrapText(h.text || '', Math.floor(h.size / 7));
  const lineH = Math.max(12, h.size * 0.22);
  const textColor = isLight(h.color) ? '#3E3B35' : '#F6F2E7';

  // icon + text laid out as one vertically-centred stack
  const gap = hasIcon && lines.length ? h.size * 0.08 : 0;
  const stackH = iconSize + gap + lines.length * lineH;
  let cursorY = h.y - stackH / 2;

  if (hasIcon) {
    const ic = svgEl('text', {
      x: h.x, y: cursorY + iconSize * 0.5,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': '"Material Symbols Outlined"',
      'font-size': iconSize,
      fill: textColor,
      'pointer-events': 'none',
    });
    ic.textContent = h.icon;
    g.appendChild(ic);
    cursorY += iconSize + gap;
  }

  const startY = cursorY + lineH * 0.5;
  lines.forEach((line, i) => {
    const t = svgEl('text', {
      x: h.x, y: startY + i * lineH,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': '"Alegreya Sans", sans-serif',
      'font-size': Math.max(9, h.size * 0.19),
      fill: textColor,
      'pointer-events': 'none',
    });
    t.textContent = line;
    g.appendChild(t);
  });
```

- [ ] **Step 2: Manual test — glyph renders and reflows**

Serve, add a hex labelled `home`, apply the `home` icon suggestion.
Expected: the house glyph sits above the word "home", both centred as a group within the hex. Remove the icon → label re-centres exactly as before this task (compare to another hex with no icon).

- [ ] **Step 3: Manual test — contrast in light and dark hex colours**

Apply an icon to a hex, then cycle its colour through the palette swatches including a light one (`#F2C96E`) and a dark one (`#3F5E78`).
Expected: glyph colour flips with the label colour (dark glyph on light hex, cream glyph on dark hex) — never invisible.

- [ ] **Step 4: Manual test — small and large hexes**

With an icon set, drag the hex-size control (or select hexes of different `size`) to the extremes (30 and 110).
Expected: glyph scales with the hex, label still fits, no overflow past the hex edge at size 30 (long labels may truncate to 3 lines as today — acceptable).

- [ ] **Step 5: Regression — exports unaffected**

Build a 3-hex map with two hexes touching and both carrying an `icon`. Click **Export csv** and **Save**.
Expected: CSV is a `from,to` edge list identical to the same map without icons; `.bee` JSON contains only `version`, `contributor`, `edges` — no `icon` key anywhere.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: render idon icon glyph on the hex"
```

---

### Task 7: Wire-up doc note

**Files:**
- Create: `vendor/README.md`

**Interfaces:** none.

- [ ] **Step 1: Write `vendor/README.md`**

```markdown
# vendor/ — experimental idon icon suggestions

Generated assets for the semantic icon-suggestion feature
(see `docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md`).

| File | What | Regenerate |
|---|---|---|
| `icon-names.json` | `{model,dim,count,scale,names[]}` | `cd tools && npm run catalog && npm run build` |
| `icon-vectors.bin` | int8 corpus, `count × 384`, row order = `names` | same |
| `transformers/` | pinned transformers.js + q8 MiniLM, offline | `cd tools && npm run vendor` |

Loaded lazily by `index.html` only on the first icon-suggestion request.
Nothing here is fetched on normal page load.
```

- [ ] **Step 2: Commit**

```bash
git add vendor/README.md
git commit -m "docs: describe vendored idon assets"
```

---

## Self-Review

**Spec coverage:**
- C1 build tool → Tasks 1–2. C2 vendored runtime → Task 3. C3 runtime engine → Task 4. C4 suggestion row → Task 5. C5 data model + rendering → Task 6. Error handling (load failure, stale results, empty label, truncation) → Task 4 Step 1 + Task 5 Step 2/5. Testing section (build self-check, runtime demo, render manual, export regression) → Task 2 Step 5, Task 4 Step 4, Task 6 Steps 2–5. "Base app unchanged / zero new bytes" → Task 4 Step 2. Non-goal "no export change" → Task 6 Step 5. Future-work items are explicitly out of scope — no tasks, correct.
- Gap found and fixed: the spec's `ICON_SCORE_FLOOR` / "no strong match" state was under-specified for the return type; Task 5 Step 5 pins it to `suggestIcons` returning `[]` below the floor and the panel distinguishing empty-input from weak-match by `h.text.trim()`.
- Gap found and fixed: the existing per-keystroke `render()` in `renderSelectedEditor` would destroy the debounce timer and the suggestion row on every keystroke; Task 5 Step 2 adds `renderCanvasOnly()` and rewires the text input.

**Placeholder scan:** no TBD/TODO; every code step has real code; regexes in tests are concrete with a documented widening rule; fallback paths (metadata source, quantised onnx filename) name the exact alternative.

**Type consistency:** `suggestIcons(label) -> string[]`, `iconEngineState` string states, `onIconEngineChange(cb)`, `ICON_SCORE_FLOOR`, `h.icon` string — used consistently across Tasks 4–6. Build-side `quantize`/`dequantizeRow`/`embedAll`/`MODEL`/`DIM`/`SCALE` consistent across Task 2 and its test. `vendor/icon-names.json` shape (`model,dim,count,scale,names`) identical in Task 2 writer, Task 2 test reader, Task 4 loader.
