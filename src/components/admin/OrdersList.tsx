import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import { formatINR } from '../../lib/money.js';
import type { OrderWithId, OrderStatus } from '../../lib/schemas.js';
import Toast, { type ToastState } from './Toast.js';

type Filter = 'all' | OrderStatus;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Needs confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: 'bg-orange-100 text-orange-700',
  confirmed: 'bg-blush-100 text-blush-700',
  preparing: 'bg-amber-50 text-amber-700',
  out_for_delivery: 'bg-sky-50 text-sky-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-ink-700/10 text-ink-700/60',
};
const FILTERS: Filter[] = ['all', 'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered: null,
  cancelled: null,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

export default function OrdersList() {
  const [orders, setOrders] = useState<OrderWithId[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function load() {
    try {
      const { orders } = await adminFetch<{ orders: OrderWithId[] }>('/api/admin/orders');
      setOrders(orders);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
    }
  }

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    if (!orders) return [];
    return filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function advance(order: OrderWithId) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdatingId(order._id);
    // Optimistic — she's often doing this one-handed, on a phone, mid-delivery.
    setOrders((prev) => prev?.map((o) => (o._id === order._id ? { ...o, status: next } : o)) ?? null);
    try {
      await adminFetch(`/api/admin/orders/${order._id}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancel(order: OrderWithId) {
    if (!confirm(`Cancel order #${order.orderCode}? The customer will still see it, marked as cancelled.`)) return;
    setUpdatingId(order._id);
    try {
      await adminFetch(`/api/admin/orders/${order._id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
    } finally {
      setUpdatingId(null);
    }
  }

  if (orders === null) return <p className="text-sm text-ink-700">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Orders</h1>
        <a
          href="/admin/orders/new"
          className="rounded-full bg-blush-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blush-600"
        >+ New order</a>
      </div>
      <p className="mt-1 text-sm text-ink-700">Log an order after you've confirmed it on WhatsApp.</p>

      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f} type="button" onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f ? 'bg-blush-500 text-white' : 'border border-blush-200 text-ink-700'
            }`}
          >{f === 'all' ? 'All' : STATUS_LABEL[f]}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-blush-200 p-8 text-center text-sm text-ink-700">
          No orders here yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-blush-100 overflow-hidden rounded-2xl border border-blush-100 bg-white">
          {shown.map((o) => {
            const next = NEXT_STATUS[o.status];
            return (
              <li key={o._id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">#{o.orderCode} · {o.customerName}</p>
                    <p className="mt-0.5 text-xs text-ink-700">
                      {formatINR(o.total)} · {o.items.length} item{o.items.length === 1 ? '' : 's'} · {fmtDate(o.createdAt)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  {next && (
                    <button
                      type="button" onClick={() => advance(o)} disabled={updatingId === o._id}
                      className="rounded-full bg-blush-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Mark {STATUS_LABEL[next]}
                    </button>
                  )}
                  {o.status !== 'cancelled' && o.status !== 'delivered' && (
                    <button
                      type="button" onClick={() => cancel(o)} disabled={updatingId === o._id}
                      className="rounded-full border border-blush-200 px-3 py-1.5 text-xs font-medium text-blush-700 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                  <a
                    href={`/api/admin/orders/${o._id}/pdf`}
                    className="rounded-full border border-blush-200 px-3 py-1.5 text-xs font-medium text-blush-700 hover:bg-blush-50"
                  >
                    Invoice PDF
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
