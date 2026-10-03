import type { APIContext } from 'astro';
import { SESSION_COOKIE, verifySessionToken, type Session } from './auth.js';

/**
 * Shared guard for every /api/admin/* route. The rule that matters:
 * authorization is decided here, server-side, on every request — a hidden
 * nav link is not access control, and the client is never trusted to gate
 * itself.
 */
export async function requireSession(context: APIContext): Promise<Session | null> {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function unauthorized(message: string = 'Unauthorized'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
