# Vendored transformers.js runtime

Do not edit by hand. Regenerate with:

    cd tools && npm install && npm run build && npm run vendor

## Contents

| Path | What | Size |
|---|---|---|
| `transformers.min.js` | `@huggingface/transformers` 3.7.6 browser bundle (the jsDelivr/unpkg entrypoint — `dist/transformers.min.js`) | ~0.9 MB |
| `ort-wasm-simd-threaded.jsep.wasm` | ONNX Runtime Web WASM binary loaded by the bundle | ~21.6 MB |
| `ort-wasm-simd-threaded.jsep.mjs` | ONNX Runtime Web JS glue for the WASM binary | ~44 KB |
| `models/Xenova/all-MiniLM-L6-v2/config.json` | model config | <1 KB |
| `models/Xenova/all-MiniLM-L6-v2/tokenizer.json` | tokenizer | ~0.7 MB |
| `models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json` | tokenizer config | <1 KB |
| `models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx` | q8-quantised feature-extraction model | **~23 MB** |

The model is ~23 MB, not the ~6 MB the design spec estimated. Accepted: the
feature is experimental, the model is lazy-loaded only when the user opens the
icon-suggestion UI, and the browser caches it after the first load.

## Browser usage (see `index.html`)

    const { pipeline, env } = await import('./vendor/transformers/transformers.min.js');
    env.allowRemoteModels = false;
    env.localModelPath = './vendor/transformers/models/';
    env.backends.onnx.wasm.wasmPaths = './vendor/transformers/';
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });

Pinned so the app has no runtime CDN dependency. The transformers.js version is
pinned in `tools/package.json` + `tools/package-lock.json`; bump it there,
reinstall, and rerun the commands above.

## Model source

`vendor-model.mjs` copies the model from the transformers.js download cache that
`npm run build` populates:
`tools/node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2/`
(with a `~/.cache/huggingface/hub` fallback). If the cache is missing it runs
`build-icon-embeddings.mjs` first to repopulate it.

## Offline verification

`tools/test-vendored-runtime.mjs` asserts the vendored model loads with
`env.allowRemoteModels = false` and returns a 384-dim L2-normalised vector. It
loads the Node build (`dist/transformers.node.mjs`) of the same pinned package
version for the assertion, because `transformers.min.js` is the browser build
(onnxruntime-web) and only runs in a real browser. The real in-browser offline
check of `transformers.min.js` itself is Task 4, Step 3.
