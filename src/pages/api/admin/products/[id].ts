import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { productSchema, type Product } from '../../../../lib/schemas.js';
import { recordCheckpoint } from '../../../../lib/revisions.js';
import { json, validationError } from '../../../../lib/apiResponse.js';

export const prerender = false;

function parseId(raw: string | undefined): ObjectId | null {
  try {
    return new ObjectId(raw);
  } catch {
    return null;
  }
}

export async function PUT(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const _id = parseId(context.params.id);
  if (!_id) return json({ error: 'Invalid product id' }, 400);

  let data: Product;
  try {
    data = productSchema.parse(await context.request.json());
  } catch (err) {
    return validationError('product', err);
  }

  const db = await getDb();

  // slug must stay unique, but not collide with itself
  const dup = await db.collection('products').findOne({ slug: data.slug, _id: { $ne: _id } });
  if (dup) return json({ error: `A product with the URL "${data.slug}" already exists.` }, 409);

  const result = await db.collection('products').findOneAndUpdate(
    { _id },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) return json({ error: 'Product not found' }, 404);

  await recordCheckpoint(db, session.email, `Updated product: ${data.name}`);

  return json({ product: result });
}

/**
 * Archive, never hard-delete. A future `orders` collection will reference
 * products by slug, and a real DELETE would orphan that history — one mis-tap
 * on a phone shouldn't be able to destroy a listing irrecoverably either.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const _id = parseId(context.params.id);
  if (!_id) return json({ error: 'Invalid product id' }, 400);

  const db = await getDb();
  const result = await db.collection<Product>('products').findOneAndUpdate(
    { _id },
    { $set: { status: 'archived', updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) return json({ error: 'Product not found' }, 404);

  await recordCheckpoint(db, session.email, `Archived product: ${result.name}`);

  return json({ product: result });
}
