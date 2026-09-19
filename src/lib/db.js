import { MongoClient } from 'mongodb';

/**
 * Module-scope connection cache.
 *
 * Serverless functions are re-invoked constantly, and a fresh MongoClient per
 * invocation will exhaust Atlas M0's connection limit under any real traffic.
 * Caching the *promise* (not the resolved client) also collapses the stampede
 * when several concurrent requests hit a cold container at once.
 *
 * Never construct a MongoClient inside a request handler. Always import this.
 */
let clientPromise;

export const DB_NAME = 'giftshop';

export function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  clientPromise ??= new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  }).connect();

  return clientPromise.then((client) => client.db(DB_NAME));
}

/** Close the pool. Only for one-shot scripts (seed, prebuild) — never in a request. */
export async function closeDb() {
  if (!clientPromise) return;
  const client = await clientPromise;
  clientPromise = undefined;
  await client.close();
}
