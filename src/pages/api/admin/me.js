import { requireSession, unauthorized } from '../../../lib/adminAuth.js';

export const prerender = false;

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  return new Response(JSON.stringify({ email: session.email, role: session.role }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
