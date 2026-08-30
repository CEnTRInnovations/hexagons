# vendor/ — experimental idon icon suggestions

Generated assets for the semantic icon-suggestion feature (see `docs/superpowers/specs/2026-08-29-idon-icon-suggestions-design.md`).

## Files

| File | What | Regenerate |
|---|---|---|
| `icon-names.json` | Corpus metadata: `{model, dim, count, scale, names[]}` | `cd tools && npm install && npm run catalog && npm run build` |
| `icon-vectors.bin` | 4214 icon embeddings, int8 quantized, 4214 × 384 bytes | same |
| `transformers/` | Pinned transformers.js + quantized MiniLM model (offline) | `cd tools && npm run vendor` |

## Size & Lazy Loading

Total: ~46 MB
- transformers.js + q8 MiniLM model: ~23 MB
- ONNX Runtime WebAssembly: ~21.6 MB
- icon-vectors.bin: ~1.6 MB

All assets are loaded **lazily** by `index.html` only on the first icon-suggestion request — nothing here is fetched on normal page load.

## Regeneration Workflow

When the Material Symbols catalog or embedding pipeline changes, run:

```bash
cd tools
npm install
npm run catalog  # Fetch Material Symbols metadata
npm run build    # Embed all icons and write icon-names.json + icon-vectors.bin
npm run vendor   # Copy transformers.js + ONNX Runtime + model to ../vendor/
```
