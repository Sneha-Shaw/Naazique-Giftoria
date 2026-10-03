import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { cart, cartOpen, setQty, removeItem, clearCart, itemCount } from '../stores/cart.js';
import { buildWhatsAppLink, cartTotal } from '../lib/whatsapp.js';
import { formatINR } from '../lib/money.js';

interface CartDrawerProps {
  whatsappNumber: string | null | undefined;
  siteUrl?: string;
  minOrderValue?: number;
  /** Whether a customer is currently signed in — checkout is gated on this. */
  signedIn: boolean;
}

export default function CartDrawer({ whatsappNumber, siteUrl, minOrderValue = 0, signedIn }: CartDrawerProps) {
  const items = useStore(cart);
  const open = useStore(cartOpen);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const total = cartTotal(items);
  const count = itemCount(items);
  const belowMin = minOrderValue > 0 && total > 0 && total < minOrderValue;
  const { url, truncated } = items.length
    ? buildWhatsAppLink({ items, number: whatsappNumber, siteUrl })
    : { url: '#', truncated: false };
  const loginUrl = `/account/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`;
  // Not signed in -> the button becomes a real link to sign in. Signed in but
  // under the minimum -> inert, same as before. Both signed in and over the
  // minimum -> the actual WhatsApp link.
  const disabledByMin = signedIn && belowMin;

  const close = () => cartOpen.set(false);

  /**
   * Fires alongside the WhatsApp link's own navigation (never blocks or
   * delays it — this just records the order). The `<a>` keeps its normal
   * `href`/`target="_blank"`, so the WhatsApp tab opens exactly as before
   * even if this request fails or is slow; checkout isn't gone, it's just
   * not logged yet, so she can still log it by hand in admin.
   */
  async function recordCheckout() {
    setCheckoutError(null);
    try {
      const res = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ name: i.name, qty: i.qty ?? 1, price: i.price, note: i.note ?? '' })),
        }),
      });
      if (!res.ok) throw new Error('save failed');
      clearCart();
    } catch {
      setCheckoutError("Your WhatsApp message went through, but we couldn't save this order to your account — mention your basket when you chat.");
    }
  }

  return (
    <>
      <div
        hidden={!open}
        onClick={close}
        className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-[2px]"
        aria-hidden="true"
      />
      <aside
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Your basket"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-cream-50 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-blush-100 px-4 py-4">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Your basket {count > 0 && <span className="text-blush-600">({count})</span>}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close basket"
            className="rounded-full p-2 text-ink-700 hover:bg-blush-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blush-400"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-ink-700">Your basket is empty.</p>
            <a href="/shop" className="rounded-full bg-blush-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blush-600">
              Browse bouquets
            </a>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-blush-100 overflow-y-auto px-4">
              {items.map((item) => (
                <li key={item.key} className="flex gap-3 py-4">
                  <img
                    src={item.image || '/placeholder.svg'}
                    alt=""
                    width="64"
                    height="64"
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    style={{ aspectRatio: '1 / 1' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{item.name}</p>
                    {item.parts && item.parts.length > 0 && (
                      <ul className="mt-0.5 text-xs text-ink-700">
                        {item.parts.map((p) => (
                          <li key={p.label} className="truncate">{p.label}: {p.value}</li>
                        ))}
                      </ul>
                    )}
                    {item.note && <p className="mt-0.5 truncate text-xs italic text-ink-700">“{item.note}”</p>}

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-full border border-blush-200">
                        <button
                          type="button"
                          onClick={() => setQty(item.key, (item.qty ?? 1) - 1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="px-2.5 py-1 text-ink-700 hover:text-blush-600"
                        >−</button>
                        <span className="min-w-6 text-center text-sm tabular-nums" aria-live="polite">{item.qty ?? 1}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.key, (item.qty ?? 1) + 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="px-2.5 py-1 text-ink-700 hover:text-blush-600"
                        >+</button>
                      </div>
                      <span className="ml-auto text-sm font-semibold text-ink-900">
                        {formatINR(item.price * (item.qty ?? 1))}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-xs text-ink-700/70 underline hover:text-blush-600"
                      >Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-blush-100 px-4 pb-6 pt-4" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-700">Total</span>
                <span className="font-display text-xl font-semibold text-ink-900">{formatINR(total)}</span>
              </div>

              {!signedIn && (
                <p className="mt-2 rounded-lg bg-blush-100 px-3 py-2 text-xs text-blush-700">
                  Sign in first so we always have the right name and number for your order.
                </p>
              )}

              {signedIn && belowMin && (
                <p className="mt-2 rounded-lg bg-blush-100 px-3 py-2 text-xs text-blush-700">
                  Minimum order is {formatINR(minOrderValue)} — add {formatINR(minOrderValue - total)} more to check out.
                </p>
              )}

              {signedIn && truncated && (
                <p className="mt-2 text-xs text-ink-700/80">
                  Your basket is long, so we’ll send a short summary and go through the details on chat.
                </p>
              )}

              <a
                href={disabledByMin ? undefined : signedIn ? url : loginUrl}
                target={signedIn && !disabledByMin ? '_blank' : undefined}
                rel={signedIn && !disabledByMin ? 'noopener' : undefined}
                aria-disabled={disabledByMin}
                onClick={(e) => {
                  if (disabledByMin) { e.preventDefault(); return; }
                  if (signedIn) recordCheckout();
                }}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-semibold text-white transition ${
                  disabledByMin ? 'cursor-not-allowed bg-ink-700/30' : signedIn ? 'bg-[#25D366] hover:brightness-95' : 'bg-blush-500 hover:bg-blush-600'
                }`}
              >
                {signedIn && !disabledByMin && (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M20.464 3.488A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.479-8.413M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/>
                  </svg>
                )}
                {!signedIn ? 'Sign in to check out' : disabledByMin ? 'Add more to check out' : 'Order on WhatsApp'}
              </a>

              {checkoutError && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{checkoutError}</p>
              )}

              {/* Set expectations before she has to manage them by hand, one chat at a time. */}
              <p className="mt-2 text-center text-xs text-ink-700/70">
                This opens a chat with your order filled in. Prices are confirmed before payment.
              </p>
              <button
                type="button"
                onClick={clearCart}
                className="mt-2 w-full text-center text-xs text-ink-700/60 underline hover:text-blush-600"
              >Clear basket</button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
