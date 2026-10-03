import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../lib/db.js';
import { requireCustomerSession, customerUnauthorized } from '../../../lib/customerGuard.js';
import type { CustomerDoc } from '../../../lib/customerAuth.js';
import { customerCheckoutSchema, generateOrderCode } from '../../../lib/schemas.js';
import { json, validationError } from '../../../lib/apiResponse.js';

export const prerender = false;

/** A signed-in customer's own order history — never another customer's. */
export async function GET(context: APIContext): Promise<Response> {
  const session = await requireCustomerSession(context);
  if (!session) return customerUnauthorized();

  const db = await getDb();
  const orders = await db.collection('orders')
    .find({ customerId: session.customerId })
    .sort({ createdAt: -1 })
    .toArray();

  return json({ orders });
}

/**
 * Checkout itself — this is what turns "opened the WhatsApp link" into a
 * real record she can see and confirm in admin. It always lands as
 * 'pending': checkout is a self-declared cart, not a confirmed order, and
 * only admin (after actually talking to the customer on WhatsApp) can move
 * it to 'confirmed' — see PUT /api/admin/orders/[id].
 *
 * customerName/customerPhone are read from the account, never from the
 * request body, for the same reason the admin's logging flow does it: an
 * invoice should reflect the account on file, not whatever happened to be
 * typed into a form.
 */
export async function POST(context: APIContext): Promise<Response> {
  const session = await requireCustomerSession(context);
  if (!session) return customerUnauthorized();

  let data;
  try {
    data = customerCheckoutSchema.parse(await context.request.json());
  } catch (err) {
    return validationError('order', err);
  }

  const db = await getDb();
  const customer = await db.collection<CustomerDoc>('customers').findOne({ _id: new ObjectId(session.customerId) });
  if (!customer) return json({ error: 'Account not found.' }, 404);

  const total = data.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const now = new Date();

  const base = {
    ...data,
    customerId: session.customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    status: 'pending' as const,
    total,
    createdAt: now,
    updatedAt: now,
  };

  // Same retry-on-collision approach as the admin logging flow — the unique
  // index on orderCode (scripts/seed.js) is the real guarantee.
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
