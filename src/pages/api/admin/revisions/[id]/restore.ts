import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../../lib/adminAuth.js';
import { recordCheckpoint, type RevisionDoc } from '../../../../../lib/revisions.js';
import type { Product } from '../../../../../lib/schemas.js';
import { json } from '../../../../../lib/apiResponse.js';

export const prerender = false;

/**
 * A revision written before `recordCheckpoint` started excluding
 * createdAt/updatedAt from its snapshot may still carry them — the type
 * doesn't promise they're absent, only that if present, this route strips
 * them before writing the product back (see below for why that matters).
 */
type SnapshotProduct = Product & { createdAt?: unknown; updatedAt?: unknown };

/**
 * Rollback: overwrite the live collections with a past checkpoint's snapshot.
 * The public site reads MongoDB live on every request (src/lib/catalog.ts),
 * so this takes effect immediately — no rebuild to trigger, same as every
 * other admin write. Restores products by `slug`, not their old `_id` (the
 * snapshot was written without one), so a rollback after a product's slug was
 * since changed recreates it fresh rather than silently merging into the
 * renamed one.
 */
export async function POST(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let _id: ObjectId;
  try {
    _id = new ObjectId(context.params.id);
  } catch {
    return json({ error: 'Invalid revision id' }, 400);
  }

  const db = await getDb();
  const revision = await db.collection<RevisionDoc>('revisions').findOne({ _id });
  if (!revision) return json({ error: 'Revision not found' }, 404);

  // `options` in an older checkpoint's snapshot (from before the builder
  // feature was removed) is simply ignored here — harmless, nothing reads it.
  const products = (revision.snapshot.products ?? []) as SnapshotProduct[];
  const gallery = revision.snapshot.gallery ?? [];
  const settings = revision.snapshot.settings ?? {};
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
      // A snapshot written before recordCheckpoint excluded these can still
      // carry its own createdAt/updatedAt. Both must be stripped before
      // re-adding updatedAt to $set and createdAt to $setOnInsert — Mongo
      // rejects a bulkWrite with the same field in both (error 40, "would
      // create a conflict"), which is what broke this the first time it was
      // exercised end-to-end.
      products.map(({ createdAt, updatedAt, ...p }) => ({
        updateOne: {
          filter: { slug: p.slug },
          update: { $set: { ...p, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      })),
    );
  }

  await db.collection('gallery').deleteMany({});
  if (gallery.length) await db.collection('gallery').insertMany(gallery);

  if (settings && Object.keys(settings).length) {
    await db.collection('settings').updateOne({ key: 'site' }, { $set: settings }, { upsert: true });
  }

  // The restore itself becomes a new checkpoint — an "undo of an undo" is
  // always available the same way any other mistake is.
  const when = revision.publishedAt instanceof Date ? revision.publishedAt.toISOString() : String(revision.publishedAt);
  await recordCheckpoint(db, session.email, `Restored checkpoint from ${when}`);

  return json({ ok: true });
}
