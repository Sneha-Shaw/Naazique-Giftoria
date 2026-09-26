import { getDb } from '../../../lib/db.js';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const MAX_REVISIONS = 50;

/**
 * "Publish to site" is a deliberate button, not an auto-trigger on every save.
 * Auto-rebuild on every edit would burn through Netlify's 300 free monthly
 * build minutes, push half-finished edits live, and give her no sense of
 * "draft vs live". A build takes ~1 minute, so even several publishes a day
 * stays far under the cap.
 *
 * Publishing does two things: snapshots the current catalogue into
 * `revisions` (the rollback mechanism — this is the actual reason Mongo earns
 * its place here over a plain committed JSON file) and calls the Netlify
 * build hook to trigger the rebuild that reads it.
 */
export async function POST(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  const [products, gallery, settings] = await Promise.all([
    db.collection('products').find({ status: { $ne: 'archived' } }, { projection: { _id: 0 } }).toArray(),
    db.collection('gallery').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } }),
  ]);

  const snapshot = { products, gallery, settings: settings ?? {} };
  let note;
  try {
    ({ note } = await context.request.json());
  } catch {
    note = undefined;
  }

  const revision = {
    snapshot,
    publishedAt: new Date(),
    publishedBy: session.email,
    note: (note ?? '').slice(0, 300),
  };
  const { insertedId } = await db.collection('revisions').insertOne(revision);

  // Trim old revisions rather than growing forever — JSON snapshots are small
  // against Atlas M0's 512MB, but no reason to keep unbounded history.
  const old = await db.collection('revisions')
    .find({}, { projection: { _id: 1 } })
    .sort({ publishedAt: -1 })
    .skip(MAX_REVISIONS)
    .toArray();
  if (old.length) {
    await db.collection('revisions').deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }

  const hookUrl = process.env.BUILD_HOOK_URL;
  if (!hookUrl) {
    return json({
      ok: true,
      revisionId: insertedId,
      buildTriggered: false,
      warning: 'BUILD_HOOK_URL is not set — the snapshot was saved but no rebuild was triggered.',
    });
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST' });
    if (!res.ok) throw new Error(`Netlify responded ${res.status}`);
  } catch (err) {
    // The snapshot is saved either way — she can retry publish, or rollback
    // is still available. A failed hook call must not look like data loss.
    return json({
      ok: true,
      revisionId: insertedId,
      buildTriggered: false,
      warning: `Saved, but couldn't reach Netlify to start the rebuild (${err.message}). Try Publish again.`,
    });
  }

  return json({ ok: true, revisionId: insertedId, buildTriggered: true });
}
