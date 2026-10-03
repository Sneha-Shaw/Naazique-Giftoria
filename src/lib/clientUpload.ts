/**
 * Client-side upload pipeline: downscale → sign → upload straight to Cloudinary.
 * Runs in the browser only (uses canvas/Image), never imported by server code.
 */

const MAX_DIMENSION = 2000;

interface UploadSignature {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
}

/** The subset of Cloudinary's upload response the app actually uses. */
export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
}

/** Phone photos are routinely 4-6MB; this saves her mobile data, upload time, and our storage quota. */
async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unsupported format — let Cloudinary handle it as-is

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file;
}

/**
 * @param publicId e.g. `ferrero-rocher-bouquet-1` — re-uploading the same id
 *   replaces the photo instead of piling up duplicates.
 */
export async function uploadImage(
  file: File,
  publicId: string,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryUploadResult> {
  const signRes = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId }),
  });
  if (!signRes.ok) {
    const err: { error?: string } = await signRes.json().catch(() => ({}));
    throw new Error(err.error || 'Could not get an upload signature.');
  }
  const { timestamp, signature, apiKey, cloudName, folder }: UploadSignature = await signRes.json();

  const processed = await downscale(file);

  const form = new FormData();
  form.append('file', processed);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('public_id', publicId);
  form.append('folder', folder);
  form.append('overwrite', 'true');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResult);
      } else {
        reject(new Error('Upload to Cloudinary failed. Check your connection and try again.'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload to Cloudinary failed. Check your connection and try again.'));
    xhr.send(form);
  });
}
