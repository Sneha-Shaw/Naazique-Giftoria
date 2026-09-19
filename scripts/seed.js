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
import { getDb, closeDb } from '../src/lib/db.js';

if (!process.env.MONGODB_URI) {
  console.error('✖ MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(resolve(here, '../src/data/catalog.json'), 'utf8'));

const db = await getDb();

// --- Indexes -------------------------------------------------------------
await db.collection('products').createIndex({ slug: 1 }, { unique: true });
await db.collection('products').createIndex({ status: 1, sort: 1 });
await db.collection('options').createIndex({ group: 1, sort: 1 });
await db.collection('users').createIndex({ email: 1 }, { unique: true });
// TTL index: login attempts evaporate after 15 minutes, giving us free,
// self-cleaning rate limiting with no cron job to run.
await db.collection('loginAttempts').createIndex({ at: 1 }, { expireAfterSeconds: 900 });
console.log('✔ indexes created');

// --- Products ------------------------------------------------------------
const now = new Date();
const productOps = seed.products.map((p) => ({
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

// --- Builder options -----------------------------------------------------
const optionOps = seed.options.map((o) => ({
  updateOne: { filter: { group: o.group, optionId: o.optionId }, update: { $set: o }, upsert: true },
}));
if (optionOps.length) {
  const r = await db.collection('options').bulkWrite(optionOps);
  console.log(`✔ options: ${r.upsertedCount} added, ${r.modifiedCount} updated`);
}

// --- Settings (never clobber existing real values) -----------------------
const existing = await db.collection('settings').findOne({ key: 'site' });
if (existing) {
  console.log('• settings already exist — left untouched');
} else {
  await db.collection('settings').insertOne({ key: 'site', ...seed.settings });
  console.log('✔ settings created (remember to set the real WhatsApp number)');
}

await closeDb();
console.log('\nDone. Run `npm run catalog:pull` to refresh the local snapshot.');
