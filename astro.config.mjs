// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';

// Set PUBLIC_SITE_URL in Netlify once the real subdomain exists — canonical URLs,
// OG tags and the sitemap all derive from it.
const site = process.env.PUBLIC_SITE_URL || 'https://example.netlify.app';

export default defineConfig({
  site,

  // 'static' is the default: every page is prerendered to HTML at build time.
  // The admin panel and /api routes (phase 2) opt out individually with
  // `export const prerender = false`, and only those deploy as functions.
  output: 'static',

  // `astro dev` otherwise tries to emulate Netlify Edge Functions locally via
  // Deno, which isn't installed and isn't needed — nothing here uses edge
  // functions (phase 2's admin/API routes are regular Netlify Functions).
  // This just silences that noisy, harmless dev-only error.
  adapter: netlify({ devFeatures: { edgeFunctions: false } }),

  integrations: [
    react(),
    sitemap({ filter: (page) => !page.includes('/admin') }),
  ],

  vite: { plugins: [tailwindcss()] },
});
