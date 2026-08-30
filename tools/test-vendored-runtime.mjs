// Offline-load assertion for the vendored runtime.
//
// Run: cd tools && node --test test-vendored-runtime.mjs
//
// NOTE on which bundle this loads: the browser (Task 4) imports the vendored
// vendor/transformers/transformers.min.js — the web build. That build pulls in
// onnxruntime-web, which needs a real browser environment (WebAssembly + DOM
// globals) and does not run under Node. So this Node test loads the
// Node-compatible build from the SAME installed package version
// (node_modules/@huggingface/transformers/dist/transformers.node.mjs) purely to
// assert that the *vendored model files* load and produce correct embeddings
// with remote fetching disabled. The real in-browser offline verification of
// transformers.min.js is Task 4, Step 3.
//
// Proof no network is used: env.allowRemoteModels = false makes transformers.js
// throw instead of hitting huggingface.co if any file is missing locally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const nodeBuild = join(here, 'node_modules', '@huggingface', 'transformers', 'dist', 'transformers.node.mjs');
const vendoredModels = join(here, '..', 'vendor', 'transformers', 'models');

test('vendored model loads offline and returns a 384-dim L2-normalised vector', async () => {
  const { pipeline, env } = await import(nodeBuild);

  env.allowRemoteModels = false;          // never touch the network
  env.localModelPath = vendoredModels;    // read only the vendored tree
  env.useFSCache = false;

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  const out = await extractor('hello world', { pooling: 'mean', normalize: true });

  assert.equal(out.data.length, 384, 'embedding dimension');

  let norm = 0;
  for (const x of out.data) norm += x * x;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-3, `expected L2 norm ~1, got ${Math.sqrt(norm)}`);
});
