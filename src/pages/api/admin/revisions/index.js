import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';

export const prerender = false;

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  // Snapshot payload excluded from the list view — it's only needed for rollback.
  const revisions = await db.collection('revisions')
    .find({}, { projection: { snapshot: 0 } })
    .sort({ publishedAt: -1 })
    .limit(50)
    .toArray();

  return new Response(JSON.stringify({ revisions }), { headers: { 'Content-Type': 'application/json' } });
}
