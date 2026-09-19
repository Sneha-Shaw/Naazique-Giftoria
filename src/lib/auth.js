import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

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

export const SESSION_COOKIE = 'gb_session';
const SESSION_TTL = '7d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is not set (or too short — use 32+ random bytes).');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken({ userId, email, role }) {
  return new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/** Returns the decoded payload, or null for a missing/invalid/expired/tampered token. Never throws. */
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { userId: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days, matches SESSION_TTL
  };
}
