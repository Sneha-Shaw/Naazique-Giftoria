import { getDb } from '../../../lib/db.js';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';
import { settingsSchema } from '../../../lib/schemas.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  const db = await getDb();
  const settings = await db.collection('settings').findOne({ key: 'site' }, { projection: { _id: 0, key: 0 } });
  return json({ settings: settings ?? {} });
}

export async function PUT(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let data;
  try {
    data = settingsSchema.parse(await context.request.json());
  } catch (err) {
    return json({ error: 'Invalid settings', details: err.errors ?? String(err) }, 400);
  }

  const db = await getDb();
  await db.collection('settings').updateOne({ key: 'site' }, { $set: data }, { upsert: true });

  return json({ settings: data });
}
