import { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { formatINR } from '../../lib/money.js';
import Toast from './Toast.jsx';

const GROUPS = [
  { key: 'wrap', label: 'Wrap colours', hasSwatch: true },
  { key: 'chocolate', label: 'Chocolates' },
  { key: 'addon', label: 'Add-ons' },
];

function blankOption(group) {
  return { group, optionId: '', label: '', priceDelta: 0, image: null, swatch: group === 'wrap' ? '#f2e8d9' : undefined, isActive: true, sort: 999 };
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function OptionsEditor() {
  const [options, setOptions] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    adminFetch('/api/admin/options')
      .then(({ options }) => setOptions(options))
      .catch((err) => setToast({ message: err.message, tone: 'error' }));
  }, []);

  if (options === null) return <p className="text-sm text-ink-700">Loading…</p>;

  function byGroup(group) {
    return options.filter((o) => o.group === group).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  function update(group, optionId, patch) {
    setOptions((prev) => prev.map((o) => (o.group === group && o.optionId === optionId ? { ...o, ...patch } : o)));
  }

  function add(group) {
    const draft = blankOption(group);
    draft.optionId = `option-${Date.now().toString(36)}`;
    draft.sort = byGroup(group).length;
    setOptions((prev) => [...prev, draft]);
  }

  function remove(group, optionId) {
    setOptions((prev) => prev.filter((o) => !(o.group === group && o.optionId === optionId)));
  }

  function move(group, index, dir) {
    const items = byGroup(group);
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const others = options.filter((o) => o.group !== group);
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setOptions([...others, ...reordered.map((o, i) => ({ ...o, sort: i }))]);
  }

  async function save() {
    // Auto-derive optionId from the label for any row that still has a
    // placeholder id, and reject truly empty labels before hitting the API.
    const cleaned = options.map((o) => ({
      ...o,
      optionId: o.optionId.startsWith('option-') && o.label ? slugify(o.label) : o.optionId,
    }));
    if (cleaned.some((o) => !o.label.trim())) {
      return setToast({ message: 'Every option needs a label.', tone: 'error' });
    }
    setSaving(true);
    try {
      const { options: saved } = await adminFetch('/api/admin/options', { method: 'PUT', body: JSON.stringify({ options: cleaned }) });
      setOptions(saved);
      setToast({ message: 'Saved.', tone: 'success' });
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Build-your-own options</h1>
      <p className="mt-1 text-sm text-ink-700">These fill the "Build your own bouquet" page. Prices are added to the base price.</p>

      <div className="mt-6 space-y-8">
        {GROUPS.map(({ key, label, hasSwatch }) => (
          <section key={key}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">{label}</h2>
              <button type="button" onClick={() => add(key)} className="text-sm font-medium text-blush-600">+ Add</button>
            </div>
            <ul className="mt-2 divide-y divide-blush-100 overflow-hidden rounded-2xl border border-blush-100 bg-white">
              {byGroup(key).map((o, i, arr) => (
                <li key={o.optionId} className="flex flex-wrap items-center gap-2 p-3">
                  {hasSwatch && (
                    <input
                      type="color" value={o.swatch ?? '#f2e8d9'}
                      onChange={(e) => update(key, o.optionId, { swatch: e.target.value })}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-blush-200"
                      aria-label={`Swatch for ${o.label || 'option'}`}
                    />
                  )}
                  <input
                    value={o.label} onChange={(e) => update(key, o.optionId, { label: e.target.value })}
                    placeholder="Label" className="min-w-0 flex-1 rounded-lg border border-blush-200 px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-ink-700">+₹</span>
                    <input
                      type="number" value={o.priceDelta}
                      onChange={(e) => update(key, o.optionId, { priceDelta: Number(e.target.value) || 0 })}
                      className="w-20 rounded-lg border border-blush-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs text-ink-700">
                    <input type="checkbox" checked={o.isActive} onChange={(e) => update(key, o.optionId, { isActive: e.target.checked })} />
                    Active
                  </label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(key, i, -1)} disabled={i === 0} className="rounded px-1.5 text-ink-700 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(key, i, 1)} disabled={i === arr.length - 1} className="rounded px-1.5 text-ink-700 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => remove(key, o.optionId)} className="rounded px-1.5 text-blush-600">✕</button>
                  </div>
                </li>
              ))}
              {byGroup(key).length === 0 && (
                <li className="p-4 text-center text-xs text-ink-700/70">No options yet.</li>
              )}
            </ul>
          </section>
        ))}
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
