#!/usr/bin/env node
/**
 * One-time setup: creates indexes and loads the sample catalogue into MongoDB.
 *
 * Safe to re-run — products are upserted by `slug`, so it will not duplicate.
 * It will NOT overwrite settings if they already exist, so re-seeding can't wipe
 * her real WhatsApp number.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  console.error('✖ MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(resolve(here, '../src/data/catalog.json'), 'utf8'));

// A one-off connection, not the pooled client from src/lib/db.ts: this script
// runs directly under Node, not bundled by Vite, so it can't resolve a `.ts`
// module through a `.js`-suffixed specifier — that resolution trick is Vite's
// "Bundler" moduleResolution, which doesn't apply to a plain `node` process.
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await client.connect();
const db = client.db('giftshop');

// --- Indexes -------------------------------------------------------------
await db.collection('products').createIndex({ slug: 1 }, { unique: true });
await db.collection('products').createIndex({ status: 1, sort: 1 });
await db.collection('users').createIndex({ email: 1 }, { unique: true });
// TTL index: login attempts evaporate after 15 minutes, giving us free,
// self-cleaning rate limiting with no cron job to run.
await db.collection('loginAttempts').createIndex({ at: 1 }, { expireAfterSeconds: 900 });
await db.collection('customers').createIndex({ email: 1 }, { unique: true });
await db.collection('orders').createIndex({ orderCode: 1 }, { unique: true });
await db.collection('orders').createIndex({ customerId: 1, createdAt: -1 });
await db.collection('orders').createIndex({ status: 1 });
console.log('✔ indexes created');

// --- Products ------------------------------------------------------------
const now = new Date();
// catalog.json can itself be a snapshot pulled FROM a live database (via
// `npm run catalog:pull`), in which case products already carry their own
// createdAt/updatedAt. Both must be stripped before re-adding updatedAt to
// $set and createdAt to $setOnInsert — Mongo rejects a bulkWrite with the same
// field in both (error 40: "would create a conflict"). Same bug, same fix as
// the rollback endpoint (src/pages/api/admin/revisions/[id]/restore.js).
const productOps = seed.products.map(({ createdAt, updatedAt, ...p }) => ({
  updateOne: {
    filter: { slug: p.slug },
    update: { $set: { ...p, updatedAt: now }, $setOnInsert: { createdAt: now } },
    upsert: true,
  },
}));
if (productOps.length) {
  const r = await db.collection('products').bulkWrite(productOps);
  console.log(`✔ products: ${r.upsertedCount} added, ${r.modifiedCount} updated`);
}

// --- Settings (never clobber existing real values) -----------------------
const existing = await db.collection('settings').findOne({ key: 'site' });
if (existing) {
  console.log('• settings already exist — left untouched');
} else {
  await db.collection('settings').insertOne({ key: 'site', ...seed.settings });
  console.log('✔ settings created (remember to set the real WhatsApp number)');
}

await client.close();
console.log('\nDone. Run `npm run catalog:pull` to refresh the local snapshot.');
