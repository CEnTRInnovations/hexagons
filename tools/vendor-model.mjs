// Vendors transformers.js + the all-MiniLM-L6-v2 q8 model into vendor/transformers/
// so the browser (index.html) has zero runtime CDN dependency.
//
// Run: cd tools && node vendor-model.mjs   (or: npm run vendor)
// Prereq: npm install (Task 1) + npm run build (Task 2) — the build populates
// the transformers.js model cache this script copies from.

import { cpSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Installed package root (its "exports" block hides package.json, so locate it directly).
const pkgRoot = join(here, 'node_modules', '@huggingface', 'transformers');
if (!existsSync(pkgRoot)) throw new Error(`@huggingface/transformers not installed — run npm install in ${here}`);
const distDir = join(pkgRoot, 'dist');

const outDir = join(here, '..', 'vendor', 'transformers');
const outModelDir = join(outDir, 'models', 'Xenova', 'all-MiniLM-L6-v2');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outModelDir, 'onnx'), { recursive: true });

// 1. The library bundle a browser import()s (the jsDelivr/unpkg entrypoint is
//    dist/transformers.min.js — see the package.json "jsdelivr"/"unpkg" fields)
//    plus every wasm / ort-*.mjs asset that sits next to it.
let copiedBundle = false;
for (const f of readdirSync(distDir)) {
  if (f === 'transformers.min.js' || /\.wasm$/.test(f) || /^ort-.*\.mjs$/.test(f)) {
    cpSync(join(distDir, f), join(outDir, f));
    if (f === 'transformers.min.js') copiedBundle = true;
    console.log(`  lib   ${f}  (${(statSync(join(distDir, f)).size / 1e6).toFixed(1)} MB)`);
  }
}
if (!copiedBundle) throw new Error(`transformers.min.js not found in ${distDir}`);

// 2. The model files. transformers.js v3 caches downloads under
//    node_modules/@huggingface/transformers/.cache/<repo>/ . Fall back to the
//    classic ~/.cache/huggingface hub layout just in case.
const modelFiles = ['config.json', 'tokenizer_config.json', 'tokenizer.json', 'onnx/model_quantized.onnx'];

function findModelSrc() {
  const tjsCache = join(pkgRoot, '.cache', 'Xenova', 'all-MiniLM-L6-v2');
  if (modelFiles.every((r) => existsSync(join(tjsCache, r)))) return tjsCache;

  const hubSnaps = join(homedir(), '.cache/huggingface/hub/models--Xenova--all-MiniLM-L6-v2/snapshots');
  if (existsSync(hubSnaps)) {
    for (const s of readdirSync(hubSnaps)) {
      const dir = join(hubSnaps, s);
      if (modelFiles.every((r) => existsSync(join(dir, r)))) return dir;
    }
  }
  return null;
}

let src = findModelSrc();
if (!src) {
  console.log('model cache missing — running build-icon-embeddings.mjs to repopulate it...');
  execFileSync('node', ['build-icon-embeddings.mjs'], { cwd: here, stdio: 'inherit' });
  src = findModelSrc();
}
if (!src) throw new Error('model files not found even after running the build');

for (const rel of modelFiles) {
  cpSync(join(src, rel), join(outModelDir, rel));
  console.log(`  model ${rel}  (${(statSync(join(src, rel)).size / 1e6).toFixed(2)} MB)`);
}

console.log(`\nvendored transformers.js + all-MiniLM-L6-v2 into ${outDir} (from ${src})`);
