import { useState } from 'react';
import { addItem, cartOpen } from '../stores/cart.js';
import type { Product } from '../lib/schemas.js';

interface AddToCartProps {
  product: Pick<Product, 'slug' | 'name' | 'price'>;
  image?: string;
  variant?: 'compact' | 'full';
  label?: string;
}

export default function AddToCart({ product, image, variant = 'compact', label = 'Add to basket' }: AddToCartProps) {
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({
      key: `product:${product.slug}`,
      type: 'product',
      name: product.name,
      price: product.price,
      image,
      qty: 1,
    });
    setAdded(true);
    if (variant === 'full') cartOpen.set(true);
    setTimeout(() => setAdded(false), 1600);
  }

  const base = 'rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blush-400 disabled:opacity-70';
  const size = variant === 'full' ? 'w-full px-6 py-3.5 text-base' : 'px-4 py-2 text-sm';

  return (
    <button
      type="button"
      onClick={handleAdd}
      className={`${base} ${size} ${added ? 'bg-blush-200 text-blush-700' : 'bg-blush-500 text-white hover:bg-blush-600'}`}
    >
      {/* aria-live so screen readers hear the confirmation, not just sighted users */}
      <span aria-live="polite">{added ? 'Added ✓' : label}</span>
    </button>
  );
}
