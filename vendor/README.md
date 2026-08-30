# vendor/ — experimental idon icon suggestions

Generated assets for the semantic icon-suggestion feature (see `docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md`).

## Files

| File | What | Regenerate |
|---|---|---|
| `icon-names.json` | Corpus metadata: `{model, dim, count, scale, names[]}` | `cd tools && npm install && npm run catalog && npm run build` |
| `icon-vectors.bin` | icon embeddings, int8 quantized (`count` × `dim` bytes) | same |

Total: ~1.6 MB. Both files are the precomputed icon corpus — not available on any CDN.

## Runtime library (CDN)

transformers.js, the MiniLM model, and the ONNX-Runtime WASM are **loaded from CDN at
runtime** (`cdn.jsdelivr.net` + `huggingface.co`) on the first icon-suggestion request.
Nothing is fetched on normal page load. If the CDN is unreachable the suggestion row shows
an "unavailable" message and the rest of the app is unaffected.
