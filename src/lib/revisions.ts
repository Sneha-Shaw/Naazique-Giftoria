import type { Db } from 'mongodb';
import type { Product, GalleryItem, Settings } from './schemas.js';

/**
 * Checkpoints are automatic: every successful admin write (product
 * create/update/archive, gallery save, settings save) snapshots the full
 * catalogue into `revisions` right after the write completes. There is no
 * manual "Publish" step anymore — catalogue changes are already live the
 * instant they're saved (src/lib/catalog.ts reads MongoDB directly, per
 * request), so the only thing left for a checkpoint to do is give "Restore"
 * on /admin/history something to roll back to if a save turns out to be a
 * mistake.
 *
 * This intentionally does NOT trigger a Netlify rebuild. That used to be the
 * whole point of the (then-manual) publish step, back when the public site
 * was static and needed a rebuild to see new data — see the plan and the
 * README's history for that design. Doing it automatically on every save now
 * would just burn through Netlify's free build-minute allowance for no
 * benefit, since nothing about page content depends on a rebuild anymore.
 */

const MAX_REVISIONS = 50;

export interface CatalogueSnapshot {
  products: Product[];
  gallery: GalleryItem[];
  settings: Partial<Settings>;
}

/**
 * What `GET /api/admin/revisions` actually returns for each checkpoint: no
 * `snapshot` (that's the whole catalogue — only fetched for an actual
 * restore), `_id` as a string (JSON, not the ObjectId it is in Mongo), and
 * `publishedAt` as an ISO string once it's crossed the wire.
 */
export type RevisionListItem = { _id: string; publishedAt: string; publishedBy: string; note: string };

/** A `revisions` collection document — a full checkpoint of the catalogue. */
export interface RevisionDoc {
  snapshot: CatalogueSnapshot;
  publishedAt: Date;
  publishedBy: string;
  note: string;
}

export async function recordCheckpoint(db: Db, by: string, note: string): Promise<void> {
  // createdAt/updatedAt excluded for the same reason fetch-catalog.js excludes
  // them from the public snapshot: they're internal bookkeeping, and carrying
  // them into a snapshot is exactly what causes a Mongo conflict later, when
  // restore.js needs to $set updatedAt and $setOnInsert createdAt on the same
  // field. Excluding them here — rather than stripping them defensively every
  // time a snapshot is read back — means restore.js doesn't need to know this
  // problem exists at all.
  const productProjection = { _id: 0, createdAt: 0, updatedAt: 0 };
  const [products, gallery, settings] = await Promise.all([
    db.collection<Product>('products').find({ status: { $ne: 'archived' } }, { projection: productProjection }).toArray(),
    db.collection<GalleryItem>('gallery').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection<Partial<Settings>>('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } }),
  ]);

  const snapshot: CatalogueSnapshot = { products, gallery, settings: settings ?? {} };

  await db.collection('revisions').insertOne({
    snapshot,
    publishedAt: new Date(),
    publishedBy: by,
    note: note.slice(0, 300),
  });

  // Trim old checkpoints rather than growing forever — snapshots are small
  // against Atlas M0's 512MB, but with automatic checkpointing on every save
  // (rather than a deliberate click) they now accumulate much faster, so this
  // matters more than it used to.
  const old = await db.collection('revisions')
    .find({}, { projection: { _id: 1 } })
    .sort({ publishedAt: -1 })
    .skip(MAX_REVISIONS)
    .toArray();
  if (old.length) {
    await db.collection('revisions').deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
}
