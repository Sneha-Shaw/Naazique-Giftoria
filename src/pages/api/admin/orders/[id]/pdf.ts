import { ObjectId } from 'mongodb';
import type { APIContext } from 'astro';
import { getDb } from '../../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../../lib/adminAuth.js';
import { generateInvoicePdf } from '../../../../../lib/invoicePdf.js';
import type { OrderWithId, Settings } from '../../../../../lib/schemas.js';

export const prerender = false;

/** Same invoice PDF as the customer gets — useful for her own records, or to attach manually on WhatsApp. */
export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let _id: ObjectId;
  try {
    _id = new ObjectId(context.params.id);
  } catch {
    return new Response('Invalid order id.', { status: 400 });
  }

  const db = await getDb();
  // Not `.collection<OrderWithId>(...)` here: OrderWithId declares `_id` as the
  // string it is once JSON-serialized to the client, but this filter needs a
  // real ObjectId — the two don't type-check against each other.
  const order = await db.collection('orders').findOne({ _id });
  if (!order) return new Response('Order not found.', { status: 404 });

  const settingsDoc = await db.collection<Settings>('settings').findOne({ key: 'site' });
  const pdf = await generateInvoicePdf(order as unknown as OrderWithId, settingsDoc ?? ({} as Settings));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${order.orderCode}.pdf"`,
    },
  });
}
