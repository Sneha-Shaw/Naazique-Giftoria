import { defineMiddleware } from 'astro:middleware';
import { json } from './lib/apiResponse.js';

/**
 * Error boundary for every request, but it matters most for /api/* and
 * /admin/*: an unhandled exception (e.g. Atlas unreachable, a bad env var)
 * must never surface a framework error page or a raw stack trace to the
 * browser — that's an information-leak risk and a bad experience on a route
 * she may be hitting from her phone. Real errors still go to the server log;
 * only a generic message reaches the client.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    return await next();
  } catch (err) {
    console.error(`[${context.url.pathname}]`, err);

    if (context.url.pathname.startsWith('/api/')) {
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }

    return new Response('Something went wrong. Please try again, or contact the developer if it persists.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
});
