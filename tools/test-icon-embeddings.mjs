import { test } from 'node:test';
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

  const money = await top('money');
  const team = await top('team');
  const warning = await top('warning');
  console.log('top5 money:', money);
  console.log('top5 team:', team);
  console.log('top5 warning:', warning);

  assert.ok(money.some((n) => /cash|money|wallet|currency|bank|payment/.test(n)));
  assert.ok(team.some((n) => /account.?group|people|team/.test(n)));
  assert.ok(warning.some((n) => /alert|warning|exclamation|caution/.test(n)));
});
