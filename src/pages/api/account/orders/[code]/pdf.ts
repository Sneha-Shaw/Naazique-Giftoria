import type { APIContext } from 'astro';
import { getDb } from '../../../../../lib/db.js';
import { requireCustomerSession, customerUnauthorized } from '../../../../../lib/customerGuard.js';
import { generateInvoicePdf } from '../../../../../lib/invoicePdf.js';
import type { OrderWithId, Settings } from '../../../../../lib/schemas.js';

export const prerender = false;

/** Same ownership check as the HTML invoice view — a code alone isn't enough. */
export async function GET(context: APIContext): Promise<Response> {
  const session = await requireCustomerSession(context);
  if (!session) return customerUnauthorized();

  const db = await getDb();
  const order = await db.collection<OrderWithId>('orders').findOne({ orderCode: context.params.code });

  if (!order || order.customerId !== session.customerId) {
    return new Response('Order not found.', { status: 404 });
  }

  const settingsDoc = await db.collection<Settings>('settings').findOne({ key: 'site' });
  const pdf = await generateInvoicePdf(order, settingsDoc ?? ({} as Settings));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${order.orderCode}.pdf"`,
    },
  });
}
