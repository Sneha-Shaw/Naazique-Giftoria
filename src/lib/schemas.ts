import { z } from 'zod';

/**
 * These schemas validate on both the admin UI (instant feedback) and the API
 * routes (the actual gate — never trust client-side validation alone). One
 * definition, imported both places, so they can't drift apart.
 */

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const productImageSchema = z.object({
  publicId: z.string().min(1),
  alt: z.string().max(200).optional().default(''),
  sort: z.number().int().default(0),
});

export const productSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(slugPattern, 'Use lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.string().trim().max(60).default(''),
  description: z.string().trim().max(4000).default(''),
  shortDesc: z.string().trim().max(200).default(''),
  price: z.coerce.number().int('Whole rupees only').min(0, 'Price cannot be negative'),
  mrp: z.coerce.number().int().min(0).default(0),
  images: z.array(productImageSchema).default([]),
  leadTimeDays: z.coerce.number().int().min(0).max(60).default(2),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  stock: z.coerce.number().int().min(0).nullable().default(null),
  sort: z.coerce.number().int().default(999),
  tags: z.array(z.string().trim().max(30)).default([]),
});

export const galleryItemSchema = z.object({
  publicId: z.string().min(1),
  caption: z.string().trim().max(200).default(''),
  isActive: z.coerce.boolean().default(true),
  sort: z.coerce.number().int().default(999),
});

export const faqSchema = z.object({
  q: z.string().trim().min(1).max(200),
  a: z.string().trim().min(1).max(1000),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(160).default(''),
  whatsappNumber: z.string().trim().regex(/^\d{10,15}$/, 'Digits only, with country code — e.g. 919876543210'),
  instagramUrl: z.union([z.string().trim().pipe(z.url()), z.literal('')]).default(''),
  deliveryAreas: z.string().trim().max(500).default(''),
  orderCutoffNote: z.string().trim().max(300).default(''),
  announcementBanner: z.string().trim().max(200).default(''),
  minOrderValue: z.coerce.number().int().min(0).default(0),
  faqs: z.array(faqSchema).default([]),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// Inferred from the schemas above rather than hand-written, so a field added
// to validation can't silently drift out of sync with the type used
// everywhere else (src/lib/catalog.ts, the admin components, ...).
export type ProductImage = z.infer<typeof productImageSchema>;
export type Product = z.infer<typeof productSchema>;
export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type Faq = z.infer<typeof faqSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * What the admin API actually returns for a product: the validated shape
 * plus the two fields validation never touches — Mongo's `_id` (a string
 * once it's crossed the wire as JSON, not the ObjectId it is in the
 * database) and the timestamps set on write, not by the admin.
 */
export type ProductWithId = Product & { _id: string; createdAt: string; updatedAt: string };
