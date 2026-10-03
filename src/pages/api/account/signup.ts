import type { APIContext } from 'astro';
import { getDb } from '../../../lib/db.js';
import {
  hashPassword, createCustomerSessionToken, CUSTOMER_SESSION_COOKIE,
  customerSessionCookieOptions, type CustomerDoc,
} from '../../../lib/customerAuth.js';
import { checkRateLimit, recordAttempt, clientIp } from '../../../lib/rateLimit.js';
import { customerSignupSchema } from '../../../lib/schemas.js';
import { json, validationError } from '../../../lib/apiResponse.js';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const { request, cookies } = context;
  const ip = clientIp(request);

  if (!(await checkRateLimit(ip))) {
    return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let data;
  try {
    data = customerSignupSchema.parse(await request.json());
  } catch (err) {
    await recordAttempt(ip);
    return validationError('details', err);
  }

  const db = await getDb();
  const existing = await db.collection('customers').findOne({ email: data.email });
  if (existing) {
    // Deliberately vague — same reasoning as login's generic error: don't let
    // a signup form be used to check which emails already have an account.
    return json({ error: 'Could not create an account with those details. Try signing in instead.' }, 409);
  }

  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const doc: CustomerDoc = {
    name: data.name, email: data.email, phone: data.phone, passwordHash,
    createdAt: now, lastLoginAt: now,
  };

  let insertedId;
  try {
    ({ insertedId } = await db.collection('customers').insertOne(doc));
  } catch (err) {
    // The findOne check above has a race window; the unique index on `email`
    // (created in scripts/seed.js) is the real guard — this just turns a
    // duplicate-key error into the same vague response instead of a 500.
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      return json({ error: 'Could not create an account with those details. Try signing in instead.' }, 409);
    }
    throw err;
  }

  const token = await createCustomerSessionToken({ customerId: insertedId, email: data.email, name: data.name });
  cookies.set(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions());

  return json({ ok: true, name: data.name, email: data.email }, 201);
}
