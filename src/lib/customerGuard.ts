import type { APIContext, AstroGlobal } from 'astro';
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken, type CustomerSession } from './customerAuth.js';
import { json } from './apiResponse.js';

/** Guard for /api/account/* routes that require a signed-in customer. */
export async function requireCustomerSession(context: APIContext): Promise<CustomerSession | null> {
  const token = context.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  return verifyCustomerSessionToken(token);
}

export function customerUnauthorized(message: string = 'Please sign in.'): Response {
  return json({ error: message }, 401);
}

/**
 * Guard for /account/*.astro pages. Usage in a page's frontmatter:
 *   const session = await requireCustomerPageSession(Astro);
 *   if (session instanceof Response) return session;
 */
export async function requireCustomerPageSession(Astro: AstroGlobal): Promise<CustomerSession | Response> {
  const token = Astro.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = await verifyCustomerSessionToken(token);
  if (!session) {
    const next = encodeURIComponent(Astro.url.pathname);
    return Astro.redirect(`/account/login?next=${next}`);
  }
  return session;
}
