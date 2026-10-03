import type { Product } from './schemas.js';

const CLOUD: string = import.meta.env?.PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';

/**
 * Fixed width ladder — deliberately NOT arbitrary per-image sizes.
 * Every distinct transformation Cloudinary generates is a derived image counted
 * against the free tier, so we reuse the same three widths everywhere.
 */
export const WIDTHS = [400, 800, 1200] as const;
const PLACEHOLDER = '/placeholder.svg';

/**
 * Products store a Cloudinary `publicId`, never a full URL, so the delivery
 * options (format, quality, crop) stay changeable in one place.
 */
export function imageUrl(publicId: string | null | undefined, width: number = 800): string {
  if (!publicId || !CLOUD) return PLACEHOLDER;
  const t = `f_auto,q_auto,c_fill,g_auto,w_${width}`;
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${t}/${publicId}`;
}

export function srcSet(publicId: string | null | undefined): string | undefined {
  if (!publicId || !CLOUD) return undefined;
  return WIDTHS.map((w) => `${imageUrl(publicId, w)} ${w}w`).join(', ');
}

/** First image of a product, or the placeholder. */
export function coverOf(product: Pick<Product, 'images'>, width: number = 800): string {
  const first = [...(product.images ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
  return imageUrl(first?.publicId, width);
}

export function coverSrcSet(product: Pick<Product, 'images'>): string | undefined {
  const first = [...(product.images ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
  return srcSet(first?.publicId);
}
