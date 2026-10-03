import type { APIContext } from 'astro';
import { getDb } from '../../../lib/db.js';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';
import { settingsSchema, type Settings } from '../../../lib/schemas.js';
import { recordCheckpoint } from '../../../lib/revisions.js';
import { json, validationError } from '../../../lib/apiResponse.js';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  const db = await getDb();
  const settings = await db.collection<Settings>('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } });
  return json({ settings: settings ?? {} });
}

export async function PUT(context: APIContext): Promise<Response> {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let data: Settings;
  try {
    data = settingsSchema.parse(await context.request.json());
  } catch (err) {
    return validationError('settings', err);
  }

  const db = await getDb();
  await db.collection('settings').updateOne({ key: 'site' }, { $set: data }, { upsert: true });

  await recordCheckpoint(db, session.email, 'Updated settings');

  return json({ settings: data });
}
