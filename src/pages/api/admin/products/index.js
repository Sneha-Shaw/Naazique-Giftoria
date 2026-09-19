import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { productSchema } from '../../../../lib/schemas.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  const products = await db.collection('products').find({}).sort({ sort: 1, name: 1 }).toArray();
  return json({ products });
}

export async function POST(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let data;
  try {
    data = productSchema.parse(await context.request.json());
  } catch (err) {
    return json({ error: 'Invalid product', details: err.errors ?? String(err) }, 400);
  }

  const db = await getDb();

  const dup = await db.collection('products').findOne({ slug: data.slug });
  if (dup) return json({ error: `A product with the URL "${data.slug}" already exists.` }, 409);

  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  const { insertedId } = await db.collection('products').insertOne(doc);

  return json({ product: { ...doc, _id: insertedId } }, 201);
}
