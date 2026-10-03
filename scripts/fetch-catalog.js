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

// A one-off connection, not the pooled client from src/lib/db.ts: this script
// is run directly by Node (`node scripts/fetch-catalog.js`), not bundled by
// Vite, so it can't resolve a `.ts` module through a `.js`-suffixed specifier
// the way every other file in the app can — that resolution trick is Vite's
// "Bundler" moduleResolution, which doesn't apply here. Same fix as
// astro.config.mjs's sitemap builder, which hit the identical problem.
const { MongoClient } = await import('mongodb');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  await client.connect();
  const db = client.db('giftshop');

  // `_id` is dropped: it is a BSON ObjectId that would serialize as an object
  // and is meaningless to the static site, which addresses products by `slug`.
  // `createdAt`/`updatedAt` are dropped too: they're internal bookkeeping the
  // site never displays, and carrying them into this snapshot is exactly what
  // broke both scripts/seed.js and the rollback endpoint's bulkWrite — Mongo
  // rejects `$set: {createdAt: ...}` alongside `$setOnInsert: {createdAt: ...}`
  // on the same field. Simplest fix is to never let those fields leave the DB.
  const productProjection = { _id: 0, createdAt: 0, updatedAt: 0 };
  const [products, gallery, settingsDoc] = await Promise.all([
    db.collection('products').find({ status: { $ne: 'archived' } }, { projection: productProjection }).toArray(),
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

  const published = products.filter((p) => p.status === 'published').length;
  ok(`${published} published product${published === 1 ? '' : 's'}, ${gallery.length} gallery images.`);
  if (published === 0) warn('no published products — the shop page will be empty.');
} catch (err) {
  await keepSnapshot(`database read failed: ${err.message}`);
} finally {
  await client.close();
}
