import { ObjectId } from 'mongodb';
import { getDb } from '../../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../../lib/adminAuth.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Rollback: overwrite the live collections with a past revision's snapshot,
 * then call the build hook again. This restores products by `slug`, not by
 * their old _id (the snapshot was written without _id — see publish.js), so a
 * rollback after someone has since renamed a product's slug recreates it
 * fresh rather than silently merging into the renamed one.
 */
export async function POST(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let _id;
  try {
    _id = new ObjectId(context.params.id);
  } catch {
    return json({ error: 'Invalid revision id' }, 400);
  }

  const db = await getDb();
  const revision = await db.collection('revisions').findOne({ _id });
  if (!revision) return json({ error: 'Revision not found' }, 404);

  const { products = [], options = [], gallery = [], settings = {} } = revision.snapshot;
  const now = new Date();

  // Restoring archives everything currently published that ISN'T in the
  // snapshot, rather than deleting it — consistent with "archive, never
  // hard-delete" everywhere else in the admin.
  const restoredSlugs = products.map((p) => p.slug);
  await db.collection('products').updateMany(
    { slug: { $nin: restoredSlugs }, status: { $ne: 'archived' } },
    { $set: { status: 'archived', updatedAt: now } },
  );

  if (products.length) {
    await db.collection('products').bulkWrite(
      // Snapshots carry their own createdAt/updatedAt from when they were taken.
      // Both must be stripped before re-adding updatedAt to $set and createdAt to
      // $setOnInsert — Mongo rejects a bulkWrite where the same field appears in
      // both (error 40: "would create a conflict"), which is what broke this the
      // first time it was exercised end-to-end.
      products.map(({ createdAt, updatedAt, ...p }) => ({
        updateOne: {
          filter: { slug: p.slug },
          update: { $set: { ...p, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      })),
    );
  }

  await db.collection('options').deleteMany({});
  if (options.length) await db.collection('options').insertMany(options);

  await db.collection('gallery').deleteMany({});
  if (gallery.length) await db.collection('gallery').insertMany(gallery);

  if (settings && Object.keys(settings).length) {
    await db.collection('settings').updateOne({ key: 'site' }, { $set: settings }, { upsert: true });
  }

  // A rollback IS a publish — it needs the same snapshot + rebuild so the live
  // site actually reflects the restored state, not just the database.
  const freshSnapshot = { products, options, gallery, settings };
  await db.collection('revisions').insertOne({
    snapshot: freshSnapshot,
    publishedAt: now,
    publishedBy: session.email,
    note: `Rolled back to revision from ${revision.publishedAt?.toISOString?.() ?? revision.publishedAt}`,
  });

  const hookUrl = process.env.BUILD_HOOK_URL;
  let buildTriggered = false;
  if (hookUrl) {
    try {
      const res = await fetch(hookUrl, { method: 'POST' });
      buildTriggered = res.ok;
    } catch {
      buildTriggered = false;
    }
  }

  return json({ ok: true, buildTriggered });
}
