import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { orderStatuses, type OrderStatus } from '../../../../lib/schemas.js';
import { json } from '../../../../lib/apiResponse.js';

export const prerender = false;

function parseId(raw: string | undefined): ObjectId | null {
  try {
    return new ObjectId(raw);
  } catch {
    return null;
  }
}

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const _id = parseId(context.params.id);
  if (!_id) return json({ error: 'Invalid order id' }, 400);

  const db = await getDb();
  const order = await db.collection('orders').findOne({ _id });
  if (!order) return json({ error: 'Order not found' }, 404);

  return json({ order });
}

/**
 * Status updates only — the line items, customer and total of a logged order
 * don't change after the fact. If she genuinely got something wrong, that's
 * a new order and this one gets cancelled, same as any real invoice.
 */
export async function PUT(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const _id = parseId(context.params.id);
  if (!_id) return json({ error: 'Invalid order id' }, 400);

  let status: OrderStatus;
  try {
    const body: { status?: string } = await context.request.json();
    if (!orderStatuses.includes(body.status as OrderStatus)) {
      return json({ error: 'Invalid status' }, 400);
    }
    status = body.status as OrderStatus;
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const db = await getDb();
  const result = await db.collection('orders').findOneAndUpdate(
    { _id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) return json({ error: 'Order not found' }, 404);
  return json({ order: result });
}
