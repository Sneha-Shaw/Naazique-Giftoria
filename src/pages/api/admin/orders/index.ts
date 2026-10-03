import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import type { CustomerDoc } from '../../../../lib/customerAuth.js';
import { orderSchema, generateOrderCode, orderStatuses, type OrderStatus, type OrderWithId } from '../../../../lib/schemas.js';
import { json, validationError } from '../../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const statusParam = context.url.searchParams.get('status');
  const status: OrderStatus | null = orderStatuses.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : null;
  const db = await getDb();
  const orders = await db.collection<OrderWithId>('orders')
    .find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .toArray();

  return json({ orders });
}

/**
 * Logging an order after confirming it on WhatsApp: pick an existing
 * customer (never retype their details — see src/pages/api/admin/customers
 * /index.ts), list what they're getting, done. The total is computed here
 * from qty * price, never trusted from the client.
 */
export async function POST(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let data;
  try {
    data = orderSchema.parse(await context.request.json());
  } catch (err) {
    return validationError('order', err);
  }

  const db = await getDb();

  let customerObjectId: ObjectId;
  try {
    customerObjectId = new ObjectId(data.customerId);
  } catch {
    return json({ error: 'Invalid customer.' }, 400);
  }
  const customer = await db.collection<CustomerDoc>('customers').findOne({ _id: customerObjectId });
  if (!customer) return json({ error: 'Customer not found.' }, 404);

  const total = data.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const now = new Date();

  const base = {
    ...data,
    customerId: data.customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    total,
    createdAt: now,
    updatedAt: now,
  };

  // Collision odds at this business's scale are negligible (6 base36 chars),
  // but the unique index on orderCode (scripts/seed.js) is the real
  // guarantee — this just retries instead of surfacing a 500 on the rare hit.
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = { ...base, orderCode: generateOrderCode() };
    try {
      const { insertedId } = await db.collection('orders').insertOne(doc);
      return json({ order: { ...doc, _id: insertedId } }, 201);
    } catch (err) {
      const isDuplicate = err && typeof err === 'object' && 'code' in err && err.code === 11000;
      if (!isDuplicate || attempt === 4) throw err;
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new Error('order creation: exhausted retries');
}
