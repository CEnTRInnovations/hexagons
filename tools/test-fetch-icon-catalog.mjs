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

test('buildCatalog drops icons with both logo+brand tags, keeps meaningful ones', () => {
  const { names, docs } = buildCatalog(parseMetadata(RAW));
  assert.ok(names.includes('delete'), 'concrete action icon should be kept');
  assert.ok(names.includes('groups'), 'social icon with meaningful tags should be kept');
  assert.ok(names.includes('verified'), 'icon with logo but not brand should be kept');
  assert.ok(!names.includes('android'), 'icon with both logo+brand should be filtered');
  assert.ok(!names.includes('blank_icon_no_tags'), 'tagless icon should be filtered');
  assert.equal(names.length, docs.length);
  const i = names.indexOf('delete');
  assert.match(docs[i], /trash|garbage|bin/);
  // sorted, unique
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
});
