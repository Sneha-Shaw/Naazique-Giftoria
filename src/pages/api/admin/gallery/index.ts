import type { APIContext } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { galleryItemSchema, type GalleryItem } from '../../../../lib/schemas.js';
import { recordCheckpoint } from '../../../../lib/revisions.js';
import { json, validationError } from '../../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  const db = await getDb();
  const gallery = await db.collection<GalleryItem>('gallery').find({}).sort({ sort: 1 }).toArray();
  return json({ gallery });
}

// Whole-list replace: the gallery is a small, manually-ordered set, so one PUT
// with the full array is simpler than per-item endpoints.
export async function PUT(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let items: GalleryItem[];
  try {
    const body: { gallery?: unknown } = await context.request.json();
    items = galleryItemSchema.array().parse(body.gallery ?? []);
  } catch (err) {
    return validationError('gallery', err);
  }

  const db = await getDb();
  await db.collection('gallery').deleteMany({});
  if (items.length) await db.collection('gallery').insertMany(items);

  await recordCheckpoint(db, session.email, `Updated gallery (${items.length} photo${items.length === 1 ? '' : 's'})`);

  return json({ gallery: items });
}
