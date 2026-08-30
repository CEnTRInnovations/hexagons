import { writeFileSync, mkdirSync } from 'node:fs';

const ENDPOINT =
  'https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols';

export function parseMetadata(text) {
  // Google prefixes the JSON body with an XSSI guard line: )]}'
  const stripped = text.replace(/^\)\]\}'\s*/, '');
  return JSON.parse(stripped);
}

function humanize(name) {
  return name.replace(/_/g, ' ');
}

function isLogoLike(icon) {
  // Drop if tags include both "logo" AND "brand" (real schema signal).
  const tags = (icon.tags || []).map((t) => t.toLowerCase());
  return tags.includes('logo') && tags.includes('brand');
}

export function buildCatalog(metadata) {
  const seen = new Set();
  const rows = [];
  for (const icon of metadata.icons || []) {
    if (!icon.tags || icon.tags.length === 0) continue;
    if (isLogoLike(icon)) continue;
    if (seen.has(icon.name)) continue;
    seen.add(icon.name);
    // Repeat the humanized name so the mean-pooled embedding leans toward the
    // icon's actual meaning rather than its (often generic) tag soup.
    const h = humanize(icon.name);
    const doc = [h, h, h, (icon.tags || []).join(', '), (icon.categories || []).join(', ')].join('. ');
    rows.push({ name: icon.name, doc });
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
