import { SESSION_COOKIE, verifySessionToken } from './auth.js';

/**
 * Server-side guard for /admin/*.astro pages (as opposed to /api/admin/* JSON
 * routes, guarded by adminAuth.js's requireSession). A hidden nav link is not
 * access control — this runs on every request, before any HTML with catalogue
 * data is sent to the browser.
 *
 * Usage in an .astro page's frontmatter:
 *   const session = await requirePageSession(Astro);
 *   if (session instanceof Response) return session;
 */
export async function requirePageSession(Astro) {
  const token = Astro.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) {
    const next = encodeURIComponent(Astro.url.pathname);
    return Astro.redirect(`/admin/login?next=${next}`);
  }
  return session;
}
