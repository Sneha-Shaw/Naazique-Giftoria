import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { ObjectId } from 'mongodb';

/**
 * Customer accounts, deliberately separate from src/lib/auth.ts (the admin
 * login): a different cookie name (`gb_customer_session`, never
 * `gb_session`), a different collection (`customers`, never `users`). A
 * customer session is never usable on an /admin route or vice versa — not
 * because either system trusts the other less, but because there is no
 * reason two completely different kinds of account should ever be able to
 * collide.
 *
 * Why customers have accounts at all, given checkout still goes through a
 * WhatsApp chat she confirms by hand: an account is where she gets a
 * reliable name/phone to reference when she logs the order afterward,
 * instead of retyping whatever the customer happened to type in chat — see
 * src/pages/api/account/signup.ts and src/pages/api/admin/orders/index.ts.
 */

export interface CustomerSession {
  customerId: string;
  email: string;
  name: string;
}

/** A `customers` collection document. */
export interface CustomerDoc {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const CUSTOMER_SESSION_COOKIE = 'gb_customer_session';
const SESSION_TTL = '30d'; // longer than admin's 7d — she logs in daily, a shopper logs in rarely

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is not set (or too short — use 32+ random bytes).');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createCustomerSessionToken(
  { customerId, email, name }: { customerId: string | ObjectId; email: string; name: string },
): Promise<string> {
  return new SignJWT({ email, name, aud: 'customer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(customerId))
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/** Returns the decoded session, or null for a missing/invalid/expired/tampered token. Never throws. */
export async function verifyCustomerSessionToken(token: string | null | undefined): Promise<CustomerSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: 'customer' });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    return { customerId: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function customerSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days, matches SESSION_TTL
  };
}
