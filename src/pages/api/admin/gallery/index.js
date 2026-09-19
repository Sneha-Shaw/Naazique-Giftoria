import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { galleryItemSchema } from '../../../../lib/schemas.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  const db = await getDb();
  const gallery = await db.collection('gallery').find({}).sort({ sort: 1 }).toArray();
  return json({ gallery });
}

// Same whole-list-replace pattern as options: a small, manually-ordered set.
export async function PUT(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let items;
  try {
    const body = await context.request.json();
    items = galleryItemSchema.array().parse(body.gallery ?? []);
  } catch (err) {
    return json({ error: 'Invalid gallery', details: err.errors ?? String(err) }, 400);
  }

  const db = await getDb();
  await db.collection('gallery').deleteMany({});
  if (items.length) await db.collection('gallery').insertMany(items);

  return json({ gallery: items });
}
