import { SESSION_COOKIE } from '../../../lib/auth.js';

export const prerender = false;

export async function POST({ cookies }) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
