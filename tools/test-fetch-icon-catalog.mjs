import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMetadata, buildCatalog } from './fetch-icon-catalog.mjs';

const RAW = readFileSync(new URL('./fixtures/icons-sample.json', import.meta.url), 'utf8');

test('parseMetadata returns the collection JSON as-is', () => {
  const md = parseMetadata(RAW);
  assert.ok(md.categories);
  assert.ok(Array.isArray(md.categories.Action));
});

test('buildCatalog prefixes names with mdi:, humanizes hyphens, dedupes, sorts', () => {
  const { names, docs } = buildCatalog(parseMetadata(RAW));
  assert.ok(names.includes('mdi:delete'), 'category icon should be kept and prefixed');
  assert.ok(names.includes('mdi:blank-icon-example'), 'uncategorized icon should be kept too');
  assert.equal(names.length, docs.length);
  assert.equal(names.length, 6, 'all 6 sample icons kept, none dropped');
  const i = names.indexOf('mdi:trash-can-outline');
  assert.match(docs[i], /^trash can outline\. trash can outline\. trash can outline\. Action$/, 'hyphens humanized, name repeated, category appended');
  // sorted, unique
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
});
