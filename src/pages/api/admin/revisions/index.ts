import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import type { RevisionDoc } from '../../../../lib/revisions.js';
import { json } from '../../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  // Snapshot payload excluded from the list view — it's only needed for rollback.
  const revisions = await db.collection<Omit<RevisionDoc, 'snapshot'>>('revisions')
    .find({}, { projection: { snapshot: 0 } })
    .sort({ publishedAt: -1 })
    .limit(50)
    .toArray();

  return json({ revisions });
}
