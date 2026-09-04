import { writeFileSync, mkdirSync } from 'node:fs';

const ENDPOINT = 'https://api.iconify.design/collection?prefix=mdi';

// Iconify's collection endpoint returns plain JSON (no XSSI guard, unlike
// Google's old endpoint) shaped as:
//   { prefix, categories: { "Category Name": ["icon-name", ...] }, uncategorized: [...] }
export function parseMetadata(text) {
  return JSON.parse(text);
}

function humanize(name) {
  return name.replace(/-/g, ' ');
}

export function buildCatalog(metadata) {
  const categoryOf = new Map();
  for (const [category, names] of Object.entries(metadata.categories || {})) {
    for (const name of names) categoryOf.set(name, category);
  }
  const all = [
    ...Object.values(metadata.categories || {}).flat(),
    ...(metadata.uncategorized || []),
  ];
  const seen = new Set();
  const rows = [];
  for (const name of all) {
    if (seen.has(name)) continue;
    seen.add(name);
    // Repeat the humanized name so the mean-pooled embedding leans toward the
    // icon's actual meaning rather than diluting it with the category alone.
    const h = humanize(name);
    const doc = [h, h, h, categoryOf.get(name) || ''].join('. ');
    rows.push({ name: `mdi:${name}`, doc });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: rows.map((r) => r.name), docs: rows.map((r) => r.doc) };
}

async function main() {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
  const catalog = buildCatalog(parseMetadata(await res.text()));
  if (catalog.names.length < 1000) {
    throw new Error(`icon catalog too small (${catalog.names.length}) — endpoint response likely broken`);
  }
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
