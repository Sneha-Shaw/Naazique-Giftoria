import catalog from '../data/catalog.json';

/**
 * The catalogue is read from MongoDB at BUILD time by scripts/fetch-catalog.js,
 * which writes the snapshot this module imports. Pages therefore never touch the
 * database at runtime: no function invocation per visitor, no Atlas in the path
 * of a page load, and the site keeps serving if the cluster is paused or down.
 */

export const settings = catalog.settings ?? {};
export const generatedAt = catalog.generatedAt ?? null;

/** Only published products ever reach the public site. Draft/archived stay hidden. */
export const products = (catalog.products ?? [])
  .filter((p) => p.status === 'published')
  .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));

export const gallery = (catalog.gallery ?? [])
  .filter((g) => g.isActive !== false)
  .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));

export function getProduct(slug) {
  return products.find((p) => p.slug === slug);
}

export const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

export function isSoldOut(product) {
  // stock === null means "always available" — she doesn't track counts for most items.
  return product.stock !== null && product.stock !== undefined && product.stock <= 0;
}
