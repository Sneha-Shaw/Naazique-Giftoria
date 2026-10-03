import { atom } from 'nanostores';
import type { CartItem } from '../lib/whatsapp.js';

const KEY = 'gb.cart.v1';

/** localStorage throws in private mode / blocked-cookie contexts — never let that break the page. */
function load(): CartItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota or blocked storage — the cart still works for this session */
  }
}

export const cart = atom<CartItem[]>(load());
export const cartOpen = atom(false);

function commit(items: CartItem[]): void {
  cart.set(items);
  save(items);
}

/**
 * Same `key` = same line item, so re-adding bumps quantity instead of
 * duplicating. Custom builds get a unique key, since two bouquets are rarely
 * identical.
 */
export function addItem(item: CartItem): void {
  const items = [...cart.get()];
  const existing = items.findIndex((i) => i.key === item.key);
  if (existing > -1) {
    items[existing] = { ...items[existing], qty: (items[existing].qty ?? 1) + (item.qty ?? 1) };
  } else {
    items.push({ qty: 1, type: 'product', ...item });
  }
  commit(items);
}

export function setQty(key: string, qty: number): void {
  const next = Math.max(0, Number(qty) || 0);
  commit(next === 0
    ? cart.get().filter((i) => i.key !== key)
    : cart.get().map((i) => (i.key === key ? { ...i, qty: next } : i)));
}

export const removeItem = (key: string): void => commit(cart.get().filter((i) => i.key !== key));
export const clearCart = (): void => commit([]);
export const itemCount = (items: CartItem[]): number => items.reduce((n, i) => n + Number(i.qty ?? 1), 0);
