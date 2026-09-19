import { SESSION_COOKIE, verifySessionToken } from './auth.js';

/**
 * Shared guard for every /api/admin/* route and /admin/* page. The rule that
 * matters: authorization is decided here, server-side, on every request — a
 * hidden nav link is not access control, and the client is never trusted to
 * gate itself.
 *
 * @returns {Promise<{userId: string, email: string, role: string} | null>}
 */
export async function requireSession(context) {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function unauthorized(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
