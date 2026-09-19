import { getDb } from '../../../lib/db.js';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';

export const prerender = false;

/**
 * Compares the current (draft) catalogue against the most recent published
 * revision, so the Publish screen can show "3 added, 1 removed, 5 prices
 * changed" before she commits to a rebuild. This is the guard against the
 * scariest failure mode here — uploading/editing over real data by mistake
 * and not noticing until a customer complains.
 */
export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  const [current, lastRevision] = await Promise.all([
    db.collection('products').find({ status: { $ne: 'archived' } }, { projection: { _id: 0 } }).toArray(),
    db.collection('revisions').findOne({}, { sort: { publishedAt: -1 } }),
  ]);

  const previous = lastRevision?.snapshot?.products ?? [];
  const prevBySlug = new Map(previous.map((p) => [p.slug, p]));
  const currBySlug = new Map(current.map((p) => [p.slug, p]));

  const added = [...currBySlug.keys()].filter((slug) => !prevBySlug.has(slug));
  const removed = [...prevBySlug.keys()].filter((slug) => !currBySlug.has(slug));
  const priceChanges = [...currBySlug.values()]
    .filter((p) => prevBySlug.has(p.slug) && prevBySlug.get(p.slug).price !== p.price)
    .map((p) => ({ slug: p.slug, name: p.name, from: prevBySlug.get(p.slug).price, to: p.price }));

  return new Response(JSON.stringify({
    hasPreviousRevision: !!lastRevision,
    added: added.map((slug) => ({ slug, name: currBySlug.get(slug).name })),
    removed: removed.map((slug) => ({ slug, name: prevBySlug.get(slug).name })),
    priceChanges,
    currentCount: current.length,
  }), { headers: { 'Content-Type': 'application/json' } });
}
