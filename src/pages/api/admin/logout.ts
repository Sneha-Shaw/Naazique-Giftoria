import type { APIContext } from 'astro';
import { SESSION_COOKIE } from '../../../lib/auth.js';
import { json } from '../../../lib/apiResponse.js';

export const prerender = false;

export async function POST({ cookies }: APIContext): Promise<Response> {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return json({ ok: true });
}
