import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { uploadImage } from '../../lib/clientUpload.js';
import { imageUrl } from '../../lib/cloudinary.js';
import Toast from './Toast.jsx';

export default function GalleryEditor() {
  const [items, setItems] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    adminFetch('/api/admin/gallery')
      .then(({ gallery }) => setItems(gallery))
      .catch((err) => setToast({ message: err.message, tone: 'error' }));
  }, []);

  if (items === null) return <p className="text-sm text-ink-700">Loading…</p>;

  async function handleFiles(fileList) {
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const publicId = `gallery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const result = await uploadImage(file, publicId);
        setItems((prev) => [...prev, { publicId: result.public_id, caption: '', isActive: true, sort: prev.length }]);
      } catch (err) {
        setToast({ message: err.message, tone: 'error' });
      }
    }
    setUploading(false);
  }

  function update(publicId, patch) {
    setItems((prev) => prev.map((g) => (g.publicId === publicId ? { ...g, ...patch } : g)));
  }

  function remove(publicId) {
    setItems((prev) => prev.filter((g) => g.publicId !== publicId).map((g, i) => ({ ...g, sort: i })));
  }

  function move(index, dir) {
    setItems((prev) => {
      const arr = [...prev];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr.map((g, i) => ({ ...g, sort: i }));
    });
  }

  async function save() {
    setSaving(true);
    try {
      const { gallery } = await adminFetch('/api/admin/gallery', { method: 'PUT', body: JSON.stringify({ gallery: items }) });
      setItems(gallery);
      setToast({ message: 'Saved.', tone: 'success' });
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Gallery</h1>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="rounded-full bg-blush-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {uploading ? 'Uploading…' : '+ Add photos'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)} />
      </div>
      <p className="mt-1 text-sm text-ink-700">Past work shown on the public gallery page.</p>

      {items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-blush-200 p-8 text-center text-sm text-ink-700">No photos yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((g, i) => (
            <li key={g.publicId} className="overflow-hidden rounded-2xl border border-blush-100 bg-white">
              <img src={imageUrl(g.publicId, 400)} alt="" className="aspect-video w-full object-cover" />
              <div className="space-y-2 p-3">
                <input
                  value={g.caption} onChange={(e) => update(g.publicId, { caption: e.target.value })}
                  placeholder="Caption (optional)" className="w-full rounded-lg border border-blush-200 px-2.5 py-1.5 text-sm"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-ink-700">
                    <input type="checkbox" checked={g.isActive} onChange={(e) => update(g.publicId, { isActive: e.target.checked })} />
                    Visible
                  </label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 text-ink-700 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded px-1.5 text-ink-700 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => remove(g.publicId)} className="rounded px-1.5 text-blush-600">✕</button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-blush-100 bg-white/95 p-3 backdrop-blur lg:sticky lg:mt-6 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <button type="button" onClick={save} disabled={saving}
          className="w-full rounded-full bg-blush-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
