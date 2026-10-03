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

// --- Customers & orders ----------------------------------------------------
// Checkout requires an account specifically so an order has a reliable,
// verified customer to reference — not retyped from a WhatsApp chat — which
// is what lets an order double as a correctly-addressed invoice.

export const customerSignupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().regex(/^\d{10,15}$/, 'Digits only, with country code — e.g. 919876543210'),
  password: z.string().min(8, 'At least 8 characters'),
});

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// 'pending' is the status a checkout creates on its own, before she's seen
// it — "confirmed" is a deliberate step she takes after confirming the
// order with the customer on WhatsApp, not something checkout can claim for
// itself. Logging an order by hand in admin (src/components/admin/OrderNew.tsx)
// skips straight to 'confirmed', since by then she already has confirmed it.
export const orderStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'] as const;

export const orderItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  qty: z.coerce.number().int().min(1).default(1),
  price: z.coerce.number().int().min(0),
  note: z.string().trim().max(300).optional().default(''),
});

export const orderSchema = z.object({
  customerId: z.string().trim().min(1, 'Pick a customer'),
  items: z.array(orderItemSchema).min(1, 'Add at least one item'),
  deliveryAddress: z.string().trim().max(500).default(''),
  deliveryDate: z.string().trim().max(40).default(''),
  status: z.enum(orderStatuses).default('confirmed'),
  note: z.string().trim().max(500).default(''),
});

/**
 * What a signed-in customer's own checkout is allowed to submit — no
 * `customerId` (taken from their session, never trusted from the client) and
 * no `status` (checkout always creates 'pending'; only admin can confirm).
 */
export const customerCheckoutSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Your basket is empty'),
  deliveryAddress: z.string().trim().max(500).default(''),
  deliveryDate: z.string().trim().max(40).default(''),
  note: z.string().trim().max(500).default(''),
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
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
export type OrderStatus = (typeof orderStatuses)[number];
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type CustomerCheckoutInput = z.infer<typeof customerCheckoutSchema>;

/**
 * What the admin API actually returns for a product: the validated shape
 * plus the two fields validation never touches — Mongo's `_id` (a string
 * once it's crossed the wire as JSON, not the ObjectId it is in the
 * database) and the timestamps set on write, not by the admin.
 */
export type ProductWithId = Product & { _id: string; createdAt: string; updatedAt: string };

/** A `customers` document as the API returns it — never includes passwordHash. */
export interface CustomerPublic {
  _id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

/**
 * A short, unguessable code shown to the customer (and usable in admin's
 * order search) instead of ever exposing a raw Mongo ObjectId publicly.
 * 6 base36 chars ~ 2 billion combinations — plenty for this business's scale,
 * short enough to read aloud on a phone call.
 */
export function generateOrderCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type OrderWithId = OrderInput & {
  _id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  total: number;
  createdAt: string;
  updatedAt: string;
};
