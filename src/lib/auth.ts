import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { ObjectId } from 'mongodb';

/**
 * Auth model: email + password (bcrypt hash in Mongo), session = a JWT in an
 * httpOnly/Secure/SameSite=Lax cookie signed with `jose`. No third-party auth
 * provider — for one internal user it's a dependency and a future paywall for
 * zero benefit, and this same setup extends cleanly to real customer accounts
 * later if that's ever needed.
 *
 * There is no customer or payment data anywhere in this system, which is what
 * keeps the security bar here "keep casual/automated access out", not
 * "withstand a targeted attack" — appropriate to what's actually at stake
 * (product prices), not overbuilt for it.
 */

export type Role = 'owner' | 'staff';

/** The decoded, verified contents of a session cookie. */
export interface Session {
  userId: string;
  email: string;
  role: Role;
}

/** A `users` collection document. */
export interface UserDoc {
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const SESSION_COOKIE = 'gb_session';
const SESSION_TTL = '7d';

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

export async function createSessionToken(
  { userId, email, role }: { userId: string | ObjectId; email: string; role: Role },
): Promise<string> {
  return new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/** Returns the decoded session, or null for a missing/invalid/expired/tampered token. Never throws. */
export async function verifySessionToken(token: string | null | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { userId: payload.sub, email: payload.email, role: payload.role as Role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days, matches SESSION_TTL
  };
}
