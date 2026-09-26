#!/usr/bin/env node
/**
 * Build-time catalogue fetch.
 *
 * Runs BEFORE `astro build` and writes src/data/catalog.json, which the pages
 * import. One database read per build instead of one per visitor.
 *
 * Critically: this must NEVER fail the build. If Atlas is paused (M0 clusters
 * pause after ~60 days idle), unreachable, or the IP allowlist is wrong, we fall
 * back to the committed snapshot and warn loudly. A stale price for a few hours
 * is recoverable; a site that won't deploy is not.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/data/catalog.json');

const warn = (msg) => console.warn(`\x1b[33m⚠ catalog: ${msg}\x1b[0m`);
const ok = (msg) => console.log(`\x1b[32m✔ catalog: ${msg}\x1b[0m`);

async function keepSnapshot(reason) {
  warn(reason);
  try {
    const existing = JSON.parse(await readFile(OUT, 'utf8'));
    warn(`falling back to the committed snapshot (generated ${existing.generatedAt ?? 'unknown'}).`);
    warn('THE SITE WILL BUILD, BUT PRICES MAY BE STALE. Check Atlas.');
    process.exit(0);
  } catch {
    console.error('\x1b[31m✖ catalog: no snapshot at src/data/catalog.json and no database. Cannot build.\x1b[0m');
    process.exit(1);
  }
}

if (!process.env.MONGODB_URI) {
  await keepSnapshot('MONGODB_URI is not set.');
}

let getDb, closeDb;
try {
  ({ getDb, closeDb } = await import('../src/lib/db.js'));
} catch (err) {
  await keepSnapshot(`could not load the db module: ${err.message}`);
}

try {
  const db = await getDb();

  // `_id` is dropped: it is a BSON ObjectId that would serialize as an object and
  // is meaningless to the static site, which addresses products by `slug`.
  const [products, gallery, settingsDoc] = await Promise.all([
    db.collection('products').find({ status: { $ne: 'archived' } }, { projection: { _id: 0 } }).toArray(),
    db.collection('gallery').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } }),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    settings: settingsDoc ?? {},
    products,
    gallery,
  };

  await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  await closeDb();

  const published = products.filter((p) => p.status === 'published').length;
  ok(`${published} published product${published === 1 ? '' : 's'}, ${gallery.length} gallery images.`);
  if (published === 0) warn('no published products — the shop page will be empty.');
} catch (err) {
  try { await closeDb?.(); } catch { /* already down */ }
  await keepSnapshot(`database read failed: ${err.message}`);
}
