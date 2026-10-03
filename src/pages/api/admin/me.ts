import type { APIContext } from 'astro';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';
import { json } from '../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  return json({ email: session.email, role: session.role });
}
