import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { formatINR } from '../../lib/money.js';
import type { CustomerPublic, ProductWithId, OrderItem, OrderWithId } from '../../lib/schemas.js';
import Toast, { type ToastState } from './Toast.js';

function emptyItem(): OrderItem {
  return { name: '', qty: 1, price: 0, note: '' };
}

export default function OrderNew() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerPublic[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerPublic | null>(null);

  const [products, setProducts] = useState<ProductWithId[]>([]);
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Catalogue loaded once, used as a quick-fill shortcut for item rows.
  useEffect(() => {
    adminFetch<{ products: ProductWithId[] }>('/api/admin/products')
      .then(({ products }) => setProducts(products.filter((p) => p.status !== 'archived')))
      .catch(() => { /* non-critical — she can still type items by hand */ });
  }, []);

  // Debounced customer search — searches on every keystroke, 300ms after typing stops.
  useEffect(() => {
    if (customer) return; // already picked — don't keep searching underneath
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { customers } = await adminFetch<{ customers: CustomerPublic[] }>(`/api/admin/customers?q=${encodeURIComponent(query)}`);
        setResults(customers);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, customer]);

  function updateItem(i: number, patch: Partial<OrderItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function fillFromProduct(i: number, productId: string) {
    const p = products.find((x) => x._id === productId);
    if (p) updateItem(i, { name: p.name, price: p.price });
  }

  const total = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const canSave = !!customer && items.every((it) => it.name.trim() && it.price >= 0 && it.qty >= 1);

  async function save() {
    if (!customer) return setToast({ message: 'Pick a customer first.', tone: 'error' });
    if (!canSave) return setToast({ message: 'Every item needs a name, price and quantity.', tone: 'error' });

    setSaving(true);
    try {
      const { order } = await adminFetch<{ order: OrderWithId }>('/api/admin/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer._id,
          items: items.map((it) => ({ ...it, qty: Number(it.qty) || 1, price: Number(it.price) || 0 })),
          deliveryAddress, deliveryDate, note, status: 'confirmed',
        }),
      });
      setToast({ message: `Saved as order #${order.orderCode}.`, tone: 'success' });
      setTimeout(() => { window.location.href = '/admin/orders'; }, 600);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3">
        <a href="/admin/orders" className="text-sm text-ink-700 hover:text-blush-600">← Orders</a>
      </div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900">Log an order</h1>
      <p className="mt-1 text-sm text-ink-700">For an order you've already confirmed with the customer on WhatsApp.</p>

      <div className="mt-6 space-y-6">
        {/* --- Customer --- */}
        <section>
          <h2 className="text-sm font-semibold text-ink-900">Customer</h2>
          {customer ? (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-blush-200 bg-blush-50 p-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">{customer.name}</p>
                <p className="text-xs text-ink-700">{customer.phone} · {customer.email}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setQuery(''); }} className="text-xs font-medium text-blush-600 underline">Change</button>
            </div>
          ) : (
            <div className="relative mt-2">
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, phone or email…"
                className="w-full rounded-xl border border-blush-200 px-3 py-2.5 text-base"
              />
              {query && (
                <ul className="mt-1 max-h-60 divide-y divide-blush-100 overflow-y-auto rounded-xl border border-blush-100 bg-white shadow-sm">
                  {searching ? (
                    <li className="p-3 text-sm text-ink-700">Searching…</li>
                  ) : results.length === 0 ? (
                    <li className="p-3 text-sm text-ink-700">No customer with an account matches that yet.</li>
                  ) : (
                    results.map((c) => (
                      <li key={c._id}>
                        <button
                          type="button"
                          onClick={() => { setCustomer(c); setQuery(''); setResults([]); }}
                          className="w-full p-3 text-left hover:bg-blush-50"
                        >
                          <p className="text-sm font-medium text-ink-900">{c.name}</p>
                          <p className="text-xs text-ink-700">{c.phone} · {c.email}</p>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-ink-700/70">
                They need their own account first — ask them to sign up on the site if they haven't.
              </p>
            </div>
          )}
        </section>

        {/* --- Items --- */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Items</h2>
            <button type="button" onClick={addItem} className="text-sm font-medium text-blush-600">+ Add item</button>
          </div>
          <div className="mt-2 space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-xl border border-blush-100 bg-white p-3">
                {products.length > 0 && (
                  <select
                    onChange={(e) => e.target.value && fillFromProduct(i, e.target.value)}
                    defaultValue=""
                    className="mb-2 w-full rounded-lg border border-blush-200 px-2.5 py-1.5 text-xs text-ink-700"
                  >
                    <option value="">Quick-fill from catalogue…</option>
                    {products.map((p) => <option key={p._id} value={p._id}>{p.name} — {formatINR(p.price)}</option>)}
                  </select>
                )}
                <input
                  value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })}
                  placeholder="Item name" className="w-full rounded-lg border border-blush-200 px-2.5 py-1.5 text-sm"
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-ink-700/70">Qty</span>
                    <input type="number" min="1" inputMode="numeric" value={it.qty}
                      onChange={(e) => updateItem(i, { qty: Number(e.target.value) || 1 })}
                      className="mt-0.5 w-full rounded-lg border border-blush-200 px-2 py-1.5 text-sm" />
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-[11px] text-ink-700/70">Price each (₹)</span>
                    <input type="number" min="0" inputMode="numeric" value={it.price}
                      onChange={(e) => updateItem(i, { price: Number(e.target.value) || 0 })}
                      className="mt-0.5 w-full rounded-lg border border-blush-200 px-2 py-1.5 text-sm" />
                  </label>
                </div>
                <input
                  value={it.note} onChange={(e) => updateItem(i, { note: e.target.value })}
                  placeholder="Note (optional — e.g. a personalisation)" className="mt-2 w-full rounded-lg border border-blush-200 px-2.5 py-1.5 text-xs"
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="mt-2 text-xs text-blush-600 underline">Remove item</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-sm font-semibold text-ink-900">Total: {formatINR(total)}</p>
        </section>

        {/* --- Delivery --- */}
        <section className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-ink-900">Delivery address</span>
            <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2}
              className="mt-1 w-full rounded-xl border border-blush-200 px-3 py-2.5 text-base" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-900">Needed by</span>
            <input value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="e.g. 5 Oct, morning"
              className="mt-1 w-full rounded-xl border border-blush-200 px-3 py-2.5 text-base" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-900">Note to self (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-blush-200 px-3 py-2.5 text-base" />
          </label>
        </section>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-blush-100 bg-white/95 p-3 backdrop-blur lg:sticky lg:mt-6 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button type="button" onClick={save} disabled={saving || !canSave}
          className="w-full rounded-full bg-blush-500 px-5 py-3.5 text-base font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : `Save order — ${formatINR(total)}`}
        </button>
      </div>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
