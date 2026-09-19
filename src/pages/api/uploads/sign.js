import crypto from 'node:crypto';
import { requireSession, unauthorized } from '../../../lib/adminAuth.js';

export const prerender = false;

/**
 * Signed uploads, not an unsigned preset: an unsigned preset name is
 * effectively public once anyone finds it in the page source, and would let
 * anyone dump files into her Cloudinary account. This route hands the browser
 * a short-lived signature; the API secret never leaves the server, and the
 * upload itself goes straight from the browser to Cloudinary — bypassing our
 * function entirely, so large photos never hit Netlify's payload limits.
 */
export async function POST(context) {
  const session = await requireSession(context);
  if (!session) return unauthorized();

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!apiSecret || !apiKey || !cloudName) {
    return new Response(JSON.stringify({ error: 'Cloudinary is not configured on the server yet.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let publicId;
  try {
    ({ publicId } = await context.request.json());
  } catch {
    publicId = undefined;
  }
  // publicId is caller-supplied (e.g. `ferrero-rocher-bouquet-1`) so re-uploading
  // the same name REPLACES the photo instead of accumulating duplicates.
  if (!publicId || !/^[a-z0-9_-]+$/i.test(publicId)) {
    return new Response(JSON.stringify({ error: 'A valid publicId is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'giftshop';
  // Only these params are signed; the browser must send exactly this set to
  // Cloudinary or the signature won't match — that's the whole point.
  const paramsToSign = { timestamp, public_id: publicId, folder, overwrite: true };
  const toSign = Object.keys(paramsToSign).sort().map((k) => `${k}=${paramsToSign[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

  return new Response(
    JSON.stringify({ timestamp, signature, apiKey, cloudName, folder, publicId }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
