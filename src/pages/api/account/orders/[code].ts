import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireCustomerSession, customerUnauthorized } from '../../../../lib/customerGuard.js';
import { json } from '../../../../lib/apiResponse.js';

export const prerender = false;

/**
 * A single order, by its public orderCode — doubles as the invoice view's
 * data source. The ownership check (customerId must match the signed-in
 * session) is the whole point of requiring an account at all: without it,
 * knowing someone else's order code would be enough to see their order.
 */
export async function GET(context: APIContext): Promise<Response> {
  const session = await requireCustomerSession(context);
  if (!session) return customerUnauthorized();

  const db = await getDb();
  const order = await db.collection('orders').findOne({ orderCode: context.params.code });

  if (!order || order.customerId !== session.customerId) {
    // Same response whether the order doesn't exist or belongs to someone
    // else — confirming "that order exists but isn't yours" is itself a leak.
    return json({ error: 'Order not found.' }, 404);
  }

  return json({ order });
}
