import { useStore } from '@nanostores/react';
import { cart, cartOpen, itemCount } from '../stores/cart.js';

/**
 * Separate island from CartDrawer, but both import the same nanostores module,
 * so Astro/Vite gives them one shared store instance.
 */
export default function CartButton() {
  const items = useStore(cart);
  const count = itemCount(items);

  return (
    <button
      type="button"
      onClick={() => cartOpen.set(true)}
      className="relative rounded-full p-2 text-ink-700 transition hover:bg-blush-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blush-400"
      aria-label={count ? `Basket, ${count} item${count === 1 ? '' : 's'}` : 'Basket, empty'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" strokeLinejoin="round" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" strokeLinecap="round" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blush-500 px-1 text-xs font-semibold text-white">
          {count}
        </span>
      )}
    </button>
  );
}
