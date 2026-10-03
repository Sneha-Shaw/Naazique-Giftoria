import { getDb } from './db.js';

/**
 * Free, self-cleaning rate limiting: a TTL index on `loginAttempts.at` (created
 * in scripts/seed.js) expires documents after 15 minutes, so there is no cron
 * job and no extra service — just a Mongo write per attempt.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function checkRateLimit(ip: string): Promise<boolean> {
  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_MS);
  const count = await db.collection('loginAttempts').countDocuments({ ip, at: { $gte: since } });
  return count < MAX_ATTEMPTS;
}

export async function recordAttempt(ip: string): Promise<void> {
  const db = await getDb();
  await db.collection('loginAttempts').insertOne({ ip, at: new Date() });
}

/** Best-effort client IP from the headers Netlify sets. Falls back to a shared bucket. */
export function clientIp(request: Request): string {
  const h = request.headers;
  return h.get('x-nf-client-connection-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
