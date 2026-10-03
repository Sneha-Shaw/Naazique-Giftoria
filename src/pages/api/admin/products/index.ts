import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { productSchema, type Product } from '../../../../lib/schemas.js';
import { recordCheckpoint } from '../../../../lib/revisions.js';
import { json, validationError } from '../../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const db = await getDb();
  const products = await db.collection<Product>('products').find({}).sort({ sort: 1, name: 1 }).toArray();
  return json({ products });
}

export async function POST(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let data: Product;
  try {
    data = productSchema.parse(await context.request.json());
  } catch (err) {
    return validationError('product', err);
  }

  const db = await getDb();

  const dup = await db.collection('products').findOne({ slug: data.slug });
  if (dup) return json({ error: `A product with the URL "${data.slug}" already exists.` }, 409);

  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  const { insertedId } = await db.collection('products').insertOne(doc);

  await recordCheckpoint(db, session.email, `Added product: ${data.name}`);

  return json({ product: { ...doc, _id: insertedId } }, 201);
}
