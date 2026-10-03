// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';

// Set PUBLIC_SITE_URL in Netlify once the real subdomain exists — canonical URLs,
// OG tags and the sitemap all derive from it.
const site = process.env.PUBLIC_SITE_URL || 'https://example.netlify.app';

/**
 * Product pages are fully server-rendered now (src/lib/catalog.js reads
 * MongoDB live, per request) instead of statically generated from a known
 * list — that's what lets a new product show up immediately with no rebuild.
 * The trade-off: `@astrojs/sitemap` can no longer discover individual
 * product URLs from getStaticPaths, since there isn't one anymore. This
 * fetches the current published slugs once, at build time, to list them in
 * the sitemap explicitly — it can go stale between builds, which is fine for
 * a sitemap (Google recrawls periodically; the pages themselves are always
 * fresh regardless). Never lets a database hiccup fail the build.
 */
async function productSitemapUrls() {
  if (!process.env.MONGODB_URI) return [];
  // A one-off connection, not the pooled client from src/lib/db.ts: this file
  // is executed directly by Node (not bundled by Vite), so it can't resolve a
  // `.ts` module through a `.js`-suffixed specifier the way every other file
  // in the app can — that resolution trick is Vite's "Bundler" moduleResolution,
  // which doesn't apply here. Simplest fix is to not depend on it at all.
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const products = await client.db('giftshop').collection('products')
      .find({ status: 'published' }, { projection: { slug: 1 } })
      .toArray();
    return products.map((p) => `${site}/products/${p.slug}/`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠ sitemap: couldn't fetch product slugs (${message}) — sitemap will omit them this build.`);
    return [];
  } finally {
    await client.close();
  }
}

export default defineConfig({
  site,

  // 'static' is the default: pages are prerendered unless they opt out. Every
  // public page here does opt out (`export const prerender = false`) to read
  // MongoDB live — see src/lib/catalog.js — alongside the admin/API routes,
  // which deploy as Netlify functions the same way.
  output: 'static',

  // `astro dev` otherwise tries to emulate Netlify Edge Functions locally via
  // Deno, which isn't installed and isn't needed — nothing here uses edge
  // functions (phase 2's admin/API routes are regular Netlify Functions).
  // This just silences that noisy, harmless dev-only error.
  adapter: netlify({ devFeatures: { environmentVariables: false, images: true, edgeFunctions: false } }),

  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/admin'),
      customPages: await productSitemapUrls(),
    }),
  ],

  vite: { plugins: [tailwindcss()] },
});
