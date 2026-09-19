import { getDb } from '../../../lib/db.js';
import { verifyPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '../../../lib/auth.js';
import { checkRateLimit, recordAttempt, clientIp } from '../../../lib/rateLimit.js';
import { loginSchema } from '../../../lib/schemas.js';

export const prerender = false;

// Identical error text for "no such email" and "wrong password" — telling them
// apart lets an attacker enumerate valid accounts for free.
const GENERIC_ERROR = 'Incorrect email or password.';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST({ request, cookies }) {
  const ip = clientIp(request);

  if (!(await checkRateLimit(ip))) {
    return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let body;
  try {
    body = loginSchema.parse(await request.json());
  } catch {
    await recordAttempt(ip);
    return json({ error: GENERIC_ERROR }, 400);
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ email: body.email });

  // Always run bcrypt.compare, even when no user exists, against a fixed dummy
  // hash — otherwise a missing-user response returns faster than a
  // wrong-password one, and that timing gap is itself an account-enumeration leak.
  const DUMMY_HASH = '$2b$12$UWemD4ziMprPzWwmuUAaeOxVZd8VNBa9VVjWzQyIdTFpK7qDZBiQS';
  const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    await recordAttempt(ip);
    return json({ error: GENERIC_ERROR }, 401);
  }

  const token = await createSessionToken({ userId: user._id, email: user.email, role: user.role });
  cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

  await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return json({ ok: true, email: user.email });
}
