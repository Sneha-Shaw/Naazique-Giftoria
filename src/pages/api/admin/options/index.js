import { getDb } from '../../../../lib/db.js';
import { requireSession, unauthorized } from '../../../../lib/adminAuth.js';
import { optionSchema } from '../../../../lib/schemas.js';

export const prerender = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();
  const db = await getDb();
  const options = await db.collection('options').find({}).sort({ group: 1, sort: 1 }).toArray();
  return json({ options });
}

/**
 * Whole-list replace rather than per-row CRUD. Builder options are a short,
 * hand-curated list (wraps, chocolates, add-ons) she reorders and edits as a
 * set in the admin UI, so one PUT with the full array is simpler than
 * per-option endpoints and keeps ordering consistent in one write.
 */
export async function PUT(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  let items;
  try {
    const body = await context.request.json();
    items = optionSchema.array().parse(body.options ?? []);
  } catch (err) {
    return json({ error: 'Invalid options', details: err.errors ?? String(err) }, 400);
  }

  const ids = new Set(items.map((o) => `${o.group}:${o.optionId}`));
  if (ids.size !== items.length) {
    return json({ error: 'Duplicate option id within the same group.' }, 400);
  }

  const db = await getDb();
  await db.collection('options').deleteMany({});
  if (items.length) await db.collection('options').insertMany(items);

  return json({ options: items });
}
