import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { formatINR } from '../../lib/money.js';
import Toast from './Toast.jsx';

const STATUS_LABEL = { published: 'Live', draft: 'Hidden from shop', archived: 'Archived' };
const STATUS_STYLE = {
  published: 'bg-emerald-50 text-emerald-700',
  draft: 'bg-amber-50 text-amber-700',
  archived: 'bg-ink-700/10 text-ink-700/60',
};

export default function ProductsList() {
  const [products, setProducts] = useState(null);
  const [filter, setFilter] = useState('active'); // active = published + draft
  const [q, setQ] = useState('');
  const [toast, setToast] = useState(null);

  async function load() {
    try {
      const { products } = await adminFetch('/api/admin/products');
      setProducts(products);
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    }
  }

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => (filter === 'active' ? p.status !== 'archived' : p.status === filter))
      .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  }, [products, filter, q]);

  async function quickToggle(product) {
    const nextStatus = product.status === 'published' ? 'draft' : 'published';
    // Optimistic update — an admin used from a phone on patchy signal shouldn't
    // wait a full round trip to see the tap register.
    setProducts((prev) => prev.map((p) => (p._id === product._id ? { ...p, status: nextStatus } : p)));
    try {
      await adminFetch(`/api/admin/products/${product._id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...product, status: nextStatus }),
      });
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
      load(); // revert to server truth
    }
  }

  if (products === null) {
    return <p className="text-sm text-ink-700">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Products</h1>
        <a
          href="/admin/products/new"
          className="rounded-full bg-blush-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blush-600"
        >+ New</a>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…"
          className="w-full rounded-xl border border-blush-200 px-3 py-2 text-sm sm:max-w-xs"
        />
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {[['active', 'Active'], ['published', 'Live'], ['draft', 'Hidden'], ['archived', 'Archived']].map(([v, label]) => (
            <button
              key={v} type="button" onClick={() => setFilter(v)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === v ? 'bg-blush-500 text-white' : 'border border-blush-200 text-ink-700'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-blush-200 p-8 text-center text-sm text-ink-700">
          No products here yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-blush-100 overflow-hidden rounded-2xl border border-blush-100 bg-white">
          {shown.map((p) => (
            <li key={p._id} className="flex items-center gap-3 p-3">
              <a href={`/admin/products/${p._id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-700">
                  {formatINR(p.price)} · {p.category || 'Uncategorised'}
                  {p.stock !== null && p.stock !== undefined && ` · ${p.stock} in stock`}
                </p>
              </a>
              {p.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => quickToggle(p)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                >{STATUS_LABEL[p.status]}</button>
              )}
              {p.status === 'archived' && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE.archived}`}>
                  {STATUS_LABEL.archived}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
