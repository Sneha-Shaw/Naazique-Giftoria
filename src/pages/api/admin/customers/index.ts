import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import type { CustomerDoc } from '../../../../lib/customerAuth.js';
import { json } from '../../../../lib/apiResponse.js';

export const prerender = false;

/**
 * Search for an existing customer when logging an order — never a free-text
 * name field, so every order references a real account with a verified
 * phone number. `?q=` matches name/email/phone (all case-insensitively for
 * name/email); empty query returns the most recent signups.
 */
export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const q = context.url.searchParams.get('q')?.trim() ?? '';
  const db = await getDb();

  const filter = q
    ? {
        $or: [
          { name: { $regex: escapeRegex(q), $options: 'i' } },
          { email: { $regex: escapeRegex(q), $options: 'i' } },
          { phone: { $regex: escapeRegex(q) } },
        ],
      }
    : {};

  const customers = await db.collection<CustomerDoc>('customers')
    .find(filter, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return json({ customers });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
