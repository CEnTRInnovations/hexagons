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
