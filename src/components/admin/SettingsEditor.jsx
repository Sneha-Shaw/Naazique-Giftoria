import { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import Toast from './Toast.jsx';

const BLANK = {
  businessName: '', tagline: '', whatsappNumber: '', instagramUrl: '',
  deliveryAreas: '', orderCutoffNote: '', announcementBanner: '', minOrderValue: 0, faqs: [],
};

export default function SettingsEditor() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    adminFetch('/api/admin/settings')
      .then(({ settings }) => setForm({ ...BLANK, ...settings }))
      .catch((err) => setToast({ message: err.message, tone: 'error' }));
  }, []);

  if (form === null) return <p className="text-sm text-ink-700">Loading…</p>;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateFaq(i, patch) {
    setForm((f) => ({ ...f, faqs: f.faqs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));
  }
  function addFaq() {
    setForm((f) => ({ ...f, faqs: [...f.faqs, { q: '', a: '' }] }));
  }
  function removeFaq(i) {
    setForm((f) => ({ ...f, faqs: f.faqs.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    if (!form.businessName.trim()) return setToast({ message: 'Business name is required.', tone: 'error' });
    if (!/^\d{10,15}$/.test(form.whatsappNumber.trim())) {
      return setToast({ message: 'WhatsApp number: digits only, with country code — e.g. 919876543210.', tone: 'error' });
    }
    setSaving(true);
    try {
      const { settings } = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...form, minOrderValue: Number(form.minOrderValue) || 0 }),
      });
      setForm({ ...BLANK, ...settings });
      setToast({ message: 'Saved.', tone: 'success' });
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Settings</h1>
      <p className="mt-1 text-sm text-ink-700">Site-wide text — the same on every page.</p>

      <div className="mt-6 space-y-4">
        <Field label="Business name"><input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} className={inputCls} /></Field>
        <Field label="Tagline"><input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputCls} /></Field>
        <Field label="WhatsApp number" hint="Country code + number, digits only — e.g. 919876543210">
          <input value={form.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Instagram link" hint="Optional"><input value={form.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} placeholder="https://instagram.com/..." className={inputCls} /></Field>
        <Field label="Delivery areas"><textarea value={form.deliveryAreas} onChange={(e) => set('deliveryAreas', e.target.value)} rows={2} className={inputCls} /></Field>
        <Field label="Lead time note"><textarea value={form.orderCutoffNote} onChange={(e) => set('orderCutoffNote', e.target.value)} rows={2} className={inputCls} /></Field>
        <Field label="Announcement banner" hint="Shows at the top of every page. Leave blank to hide.">
          <input value={form.announcementBanner} onChange={(e) => set('announcementBanner', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Minimum order value (₹)" hint="Cart checkout is blocked below this">
          <input type="number" inputMode="numeric" min="0" value={form.minOrderValue} onChange={(e) => set('minOrderValue', e.target.value)} className={inputCls} />
        </Field>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">FAQs</h2>
            <button type="button" onClick={addFaq} className="text-sm font-medium text-blush-600">+ Add</button>
          </div>
          <div className="mt-2 space-y-3">
            {form.faqs.map((f, i) => (
              <div key={i} className="rounded-xl border border-blush-100 bg-white p-3">
                <input value={f.q} onChange={(e) => updateFaq(i, { q: e.target.value })} placeholder="Question" className={`${inputCls} mt-0`} />
                <textarea value={f.a} onChange={(e) => updateFaq(i, { a: e.target.value })} placeholder="Answer" rows={2} className={`${inputCls} mt-2`} />
                <button type="button" onClick={() => removeFaq(i)} className="mt-2 text-xs text-blush-600 underline">Remove</button>
              </div>
            ))}
            {form.faqs.length === 0 && <p className="text-xs text-ink-700/70">No FAQs yet.</p>}
          </div>
        </section>
      </div>

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
