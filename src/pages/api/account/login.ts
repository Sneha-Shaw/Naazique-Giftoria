import type { APIContext } from 'astro';
import { getDb } from '../../../lib/db.js';
import {
  verifyPassword, createCustomerSessionToken, CUSTOMER_SESSION_COOKIE,
  customerSessionCookieOptions, type CustomerDoc,
} from '../../../lib/customerAuth.js';
import { checkRateLimit, recordAttempt, clientIp } from '../../../lib/rateLimit.js';
import { customerLoginSchema } from '../../../lib/schemas.js';
import { json } from '../../../lib/apiResponse.js';

export const prerender = false;

// Same text for "no such account" and "wrong password" — telling them apart
// lets an attacker enumerate real customer emails for free.
const GENERIC_ERROR = 'Incorrect email or password.';

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const ip = clientIp(request);

  if (!(await checkRateLimit(ip))) {
    return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let body: { email: string; password: string };
  try {
    body = customerLoginSchema.parse(await request.json());
  } catch {
    await recordAttempt(ip);
    return json({ error: GENERIC_ERROR }, 400);
  }

  const db = await getDb();
  const customer = await db.collection<CustomerDoc>('customers').findOne({ email: body.email });

  // Always run bcrypt.compare, even with no matching account, against a fixed
  // dummy hash — otherwise a missing-account response returns measurably
  // faster than a wrong-password one, which is itself an enumeration leak.
  const DUMMY_HASH = '$2b$12$UWemD4ziMprPzWwmuUAaeOxVZd8VNBa9VVjWzQyIdTFpK7qDZBiQS';
  const ok = await verifyPassword(body.password, customer?.passwordHash ?? DUMMY_HASH);

  if (!customer || !ok) {
    await recordAttempt(ip);
    return json({ error: GENERIC_ERROR }, 401);
  }

  const token = await createCustomerSessionToken({ customerId: customer._id, email: customer.email, name: customer.name });
  cookies.set(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions());

  await db.collection('customers').updateOne({ email: body.email }, { $set: { lastLoginAt: new Date() } });

  return json({ ok: true, name: customer.name, email: customer.email });
}
