import type { APIContext } from 'astro';
import { CUSTOMER_SESSION_COOKIE } from '../../../lib/customerAuth.js';
import { json } from '../../../lib/apiResponse.js';

export const prerender = false;

export async function POST({ cookies }: APIContext): Promise<Response> {
  cookies.delete(CUSTOMER_SESSION_COOKIE, { path: '/' });
  return json({ ok: true });
}
