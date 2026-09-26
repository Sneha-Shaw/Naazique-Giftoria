import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { uploadImage } from '../../lib/clientUpload.js';
import { imageUrl } from '../../lib/cloudinary.js';
import Toast from './Toast.jsx';

const BLANK = {
  slug: '', name: '', category: '', description: '', shortDesc: '',
  price: '', mrp: '', images: [], leadTimeDays: 2, status: 'draft',
  stock: '', sort: 999, tags: [],
};

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function draftKey(id) {
  return `gb.admin.draft.product.${id ?? 'new'}`;
}

export default function ProductEditor({ productId }) {
  const isNew = !productId;
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileInputRef = useRef(null);

  // --- Load existing product, or a locally-saved draft for a new one ------
  useEffect(() => {
    if (isNew) {
      try {
        const saved = localStorage.getItem(draftKey());
        if (saved) setForm({ ...BLANK, ...JSON.parse(saved) });
      } catch { /* corrupt draft — start blank rather than crash */ }
      return;
    }
    adminFetch(`/api/admin/products`)
      .then(({ products }) => {
        const p = products.find((x) => x._id === productId);
        if (!p) { setToast({ message: 'Product not found.', tone: 'error' }); return; }
        setForm({ ...BLANK, ...p, price: String(p.price), mrp: p.mrp ? String(p.mrp) : '', stock: p.stock ?? '' });
      })
      .catch((err) => setToast({ message: err.message, tone: 'error' }))
      .finally(() => setLoading(false));
  }, [productId]);

  // --- Autosave to localStorage. Nothing she types should ever be lost, and
  // nothing reaches customers until she explicitly saves/publishes. ---------
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(isNew ? undefined : productId), JSON.stringify(form)); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [form, loading, isNew, productId]);

  function set(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'name' && isNew && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  const priceNum = Number(form.price) || 0;
  const mrpNum = Number(form.mrp) || 0;
  const discountPct = mrpNum > priceNum && priceNum > 0 ? Math.round(((mrpNum - priceNum) / mrpNum) * 100) : null;

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    for (const file of files) {
      const idx = form.images.length;
      const publicId = `${form.slug || 'product'}-${idx + 1}-${Date.now().toString(36)}`;
      const key = publicId;
      setUploadingKey(key);
      try {
        const result = await uploadImage(file, publicId);
        setForm((f) => ({
          ...f,
          images: [...f.images, { publicId: result.public_id, alt: f.name, sort: f.images.length }],
        }));
      } catch (err) {
        setToast({ message: err.message, tone: 'error' });
      } finally {
        setUploadingKey(null);
      }
    }
  }

  function moveImage(index, dir) {
    setForm((f) => {
      const images = [...f.images];
      const target = index + dir;
      if (target < 0 || target >= images.length) return f;
      [images[index], images[target]] = [images[target], images[index]];
      return { ...f, images: images.map((img, i) => ({ ...img, sort: i })) };
    });
  }

  function removeImage(index) {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index).map((img, i) => ({ ...img, sort: i })) }));
  }

  async function handleSave(publishNow) {
    if (!form.name.trim()) return setToast({ message: 'Give it a name first.', tone: 'error' });
    if (!form.slug.trim()) return setToast({ message: 'The URL field is required.', tone: 'error' });
    if (priceNum <= 0) return setToast({ message: 'Set a price above ₹0.', tone: 'error' });

    setSaving(true);
    const payload = {
      ...form,
      price: priceNum,
      mrp: mrpNum,
      stock: form.stock === '' ? null : Number(form.stock),
      status: publishNow ? 'published' : form.status === 'archived' ? 'draft' : form.status,
    };

    try {
      const { product } = isNew
        ? await adminFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) })
        : await adminFetch(`/api/admin/products/${productId}`, { method: 'PUT', body: JSON.stringify(payload) });

      try { localStorage.removeItem(draftKey(isNew ? undefined : productId)); } catch { /* ignore */ }
      setToast({ message: publishNow ? 'Saved and set live.' : 'Saved.', tone: 'success' });

      if (isNew) {
        setTimeout(() => { window.location.href = `/admin/products/${product._id}`; }, 400);
      } else {
        setForm((f) => ({ ...f, status: payload.status }));
      }
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Hide "${form.name}" from the shop? You can restore it later — nothing is deleted.`)) return;
    try {
      await adminFetch(`/api/admin/products/${productId}`, { method: 'DELETE' });
      window.location.href = '/admin/products';
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    }
  }

  if (loading) return <p className="text-sm text-ink-700">Loading…</p>;

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3">
        <a href="/admin/products" className="text-sm text-ink-700 hover:text-blush-600" aria-label="Back to products">← Products</a>
      </div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900">
        {isNew ? 'New product' : form.name || 'Edit product'}
      </h1>

      <div className="mt-6 space-y-6">
        {/* --- Photos --- */}
        <section>
          <h2 className="text-sm font-semibold text-ink-900">Photos</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {form.images.map((img, i) => (
              <div key={img.publicId} className="group relative aspect-square overflow-hidden rounded-xl bg-blush-50">
                <img src={imageUrl(img.publicId, 400)} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-blush-700">Cover</span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 p-1">
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move earlier" className="rounded bg-white/90 px-1.5 py-0.5 text-xs disabled:opacity-40">←</button>
                  <button type="button" onClick={() => removeImage(i)} aria-label="Remove photo" className="rounded bg-white/90 px-1.5 py-0.5 text-xs text-blush-600">✕</button>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} aria-label="Move later" className="rounded bg-white/90 px-1.5 py-0.5 text-xs disabled:opacity-40">→</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!uploadingKey}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blush-200 text-blush-500 hover:bg-blush-50 disabled:opacity-60"
            >
              {uploadingKey ? (
                <span className="text-xs">Uploading…</span>
              ) : (
                <>
                  <span className="text-2xl leading-none">+</span>
                  <span className="text-xs">Add photo</span>
                </>
              )}
            </button>
          </div>
          <input
            ref={fileInputRef} type="file" accept="image/*" multiple capture="environment"
            className="hidden" onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
          />
        </section>

        {/* --- Basics --- */}
        <section className="space-y-4">
          <Field label="Name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="URL" hint={`naaziquegiftoria.netlify.app/products/${form.slug || '…'}`}>
            <input
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }}
              className={inputCls}
            />
          </Field>
          <Field label="Category">
            <input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Chocolate, Hamper, Special…" className={inputCls} />
          </Field>
          <Field label="Short description" hint="Shown on the product card, one line">
            <input value={form.shortDesc} onChange={(e) => set('shortDesc', e.target.value)} maxLength={200} className={inputCls} />
          </Field>
          <Field label="Full description">
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} className={inputCls} />
          </Field>
        </section>

        {/* --- Pricing --- */}
        <section className="grid grid-cols-2 gap-4">
          <Field label="Price (₹)">
            <input type="number" inputMode="numeric" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Original price (₹)" hint="Optional — shows a strikethrough">
            <input type="number" inputMode="numeric" min="0" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} className={inputCls} />
          </Field>
          {discountPct && (
            <p className="col-span-2 -mt-2 text-xs text-emerald-700">Shows as {discountPct}% off</p>
          )}
          <Field label="Made in (days)">
            <input type="number" inputMode="numeric" min="0" value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Stock count" hint="Leave blank = always available">
            <input type="number" inputMode="numeric" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} className={inputCls} />
          </Field>
        </section>

        {/* --- Visibility --- */}
        <section className="rounded-2xl border border-blush-100 bg-white p-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold text-ink-900">Visible in shop</span>
              <span className="block text-xs text-ink-700">Off keeps it saved but hidden from customers.</span>
            </span>
            <input
              type="checkbox"
              checked={form.status === 'published'}
              onChange={(e) => set('status', e.target.checked ? 'published' : 'draft')}
              className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-ink-700/20 transition checked:bg-blush-500 relative before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition checked:before:translate-x-5"
            />
          </label>
        </section>

        {!isNew && (
          <button type="button" onClick={handleArchive} className="text-sm text-ink-700/70 underline hover:text-blush-600">
            Hide and archive this product
          </button>
        )}
      </div>

      {/* Sticky save bar — always reachable with a thumb, never scroll-and-hunt on a phone. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-blush-100 bg-white/95 p-3 backdrop-blur lg:sticky lg:bottom-0 lg:mt-6 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button type="button" onClick={() => handleSave(false)} disabled={saving}
          className="flex-1 rounded-full border border-blush-300 px-5 py-3 text-sm font-semibold text-blush-700 disabled:opacity-60">
          Save draft
        </button>
        <button type="button" onClick={() => handleSave(true)} disabled={saving}
          className="flex-1 rounded-full bg-blush-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : 'Save & set live'}
        </button>
      </div>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}

const inputCls = 'mt-1 w-full rounded-xl border border-blush-200 px-3 py-2.5 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-900">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-700/70">{hint}</span>}
    </label>
  );
}
