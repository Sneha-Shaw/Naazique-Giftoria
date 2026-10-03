import { getDb } from './db.js';
import staticSnapshot from '../data/catalog.json';
import type { Product, GalleryItem, Settings } from './schemas.js';

/**
 * The catalogue is read live from MongoDB on every request (pages that use
 * this must be `export const prerender = false`). This trades the earlier
 * build-time-snapshot model for "changes appear on refresh, no rebuild
 * needed" — the actual thing this business needs, since routine catalogue
 * edits shouldn't require a Netlify build or a manual `catalog:pull`.
 *
 * The resilience property from the old design is kept, just moved from
 * per-build to per-request: if Atlas is unreachable, `getLiveCatalog()`
 * falls back to the committed src/data/catalog.json snapshot (refreshed by
 * `npm run catalog:pull`) instead of the page failing to render.
 */

export interface LiveCatalog {
  settings: Settings;
  products: Product[];
  gallery: GalleryItem[];
  categories: string[];
}

// Every field, explicitly. This is the actual fix for "Property 'x' does not
// exist on type '{}'" — a bare `settings ?? {}` lets TypeScript infer the
// empty-object case as having no known fields at all. Merging onto real
// defaults means `settings` is always a complete, correctly-typed Settings,
// whether it came from Mongo, the static fallback, or was missing entirely
// (a fresh Atlas cluster, or an old document written before a field existed).
const DEFAULT_SETTINGS: Settings = {
  businessName: 'Naazique Giftoria',
  tagline: '',
  whatsappNumber: '',
  instagramUrl: '',
  deliveryAreas: '',
  orderCutoffNote: '',
  announcementBanner: '',
  minOrderValue: 0,
  faqs: [],
};

interface RawCatalog {
  products?: Product[];
  gallery?: GalleryItem[];
  settings?: Partial<Settings> | null;
}

function shape(raw: RawCatalog): LiveCatalog {
  const products = [...(raw.products ?? [])]
    .filter((p) => p.status === 'published')
    .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));

  return {
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    products,
    gallery: [...(raw.gallery ?? [])]
      .filter((g) => g.isActive !== false)
      .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)),
    categories: deriveCategories(products),
  };
}

// Computed once at module load — this is the fallback used only when the
// live database read fails. Refresh it with `npm run catalog:pull`.
const STATIC_FALLBACK = shape(staticSnapshot as RawCatalog);

export async function getLiveCatalog(): Promise<LiveCatalog> {
  try {
    const db = await getDb();
    const projection = { _id: 0, createdAt: 0, updatedAt: 0 };
    const [products, gallery, settingsDoc] = await Promise.all([
      db.collection<Product>('products').find({ status: 'published' }, { projection }).toArray(),
      db.collection<GalleryItem>('gallery').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection<Partial<Settings>>('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } }),
    ]);
    return shape({ products, gallery, settings: settingsDoc });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[catalog] live read failed, serving the static fallback snapshot:', message);
    return STATIC_FALLBACK;
  }
}

/** Single-product lookup by slug, live, with the same fallback behaviour. */
export async function getLiveProduct(slug: string): Promise<Product | undefined> {
  const catalog = await getLiveCatalog();
  return catalog.products.find((p) => p.slug === slug);
}

function deriveCategories(products: Product[]): string[] {
  return [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
}

export function isSoldOut(product: Pick<Product, 'stock'>): boolean {
  // stock === null means "always available" — she doesn't track counts for most items.
  return product.stock !== null && product.stock !== undefined && product.stock <= 0;
}
