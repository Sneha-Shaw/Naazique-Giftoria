import { formatINR } from './money.js';

/**
 * wa.me silently fails to open when the URL gets too long — no error, the link
 * just does nothing. So we budget the ENCODED length (emoji and newlines inflate
 * sharply once percent-encoded) and degrade the message in stages rather than
 * emitting a link that quietly breaks on her customer's phone.
 */
export const MAX_ENCODED = 1500;
const NOTE_LIMIT = 60;

const DETAIL_LEVELS = ['full', 'brief', 'summary'] as const;
export type MessageDetail = (typeof DETAIL_LEVELS)[number];

export interface CartItemPart {
  label: string;
  value: string;
}

/** The shape src/stores/cart.js persists and every "order this" call site builds. */
export interface CartItem {
  key: string;
  type?: 'product' | 'custom';
  name: string;
  price: number;
  qty?: number;
  image?: string;
  parts?: CartItemPart[];
  note?: string;
}

export interface WhatsAppLink {
  url: string;
  message: string;
  detail: MessageDetail;
  truncated: boolean;
}

/** "+91 98765 43210" -> "919876543210". wa.me wants digits only, no plus. */
export function normalizeNumber(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + Number(i.price) * Number(i.qty ?? 1), 0);
}

function truncate(text: string | null | undefined, limit: number): string {
  const t = String(text ?? '').trim();
  return t.length <= limit ? t : `${t.slice(0, limit - 1).trimEnd()}…`;
}

function composeMessage(
  { items, siteUrl, detail = 'full' }: { items: CartItem[]; siteUrl?: string; detail?: MessageDetail },
): string {
  const total = cartTotal(items);

  if (detail === 'summary') {
    const count = items.reduce((n, i) => n + Number(i.qty ?? 1), 0);
    return [
      'Hi! I’d like to order 🎁',
      '',
      `${count} item${count === 1 ? '' : 's'} — total ${formatINR(total)}`,
      'My full basket is saved on the website, happy to go through it here.',
      '',
      'Delivery pincode: ______',
      'Needed by: ______',
      siteUrl ? `— ${siteUrl}` : '',
    ].filter(Boolean).join('\n');
  }

  const lines = ['Hi! I’d like to order 🎁', ''];

  items.forEach((item, idx) => {
    const qty = Number(item.qty ?? 1);
    lines.push(`${idx + 1}. ${item.name} ×${qty} — ${formatINR(item.price * qty)}`);

    if (detail === 'full') {
      for (const part of item.parts ?? []) {
        lines.push(`   • ${part.label}: ${part.value}`);
      }
      if (item.note) lines.push(`   • Note: "${truncate(item.note, NOTE_LIMIT)}"`);
    } else if ((item.parts?.length ?? 0) > 0 || item.note) {
      lines.push('   • (custom details — I’ll share them here)');
    }
  });

  lines.push('', `Total: ${formatINR(total)}`);
  // Left blank on purpose: she needs both for every single order, and an empty
  // line prompts the customer to fill them in unprompted.
  lines.push('Delivery pincode: ______', 'Needed by: ______');
  if (siteUrl) lines.push('', `— ${siteUrl}`);

  return lines.join('\n');
}

/** Builds the wa.me link, degrading detail until the encoded URL fits. */
export function buildWhatsAppLink(
  { items, number, siteUrl }: { items: CartItem[]; number: string | null | undefined; siteUrl?: string },
): WhatsAppLink {
  const digits = normalizeNumber(number);

  for (const detail of DETAIL_LEVELS) {
    const message = composeMessage({ items, siteUrl, detail });
    const encoded = encodeURIComponent(message);
    if (encoded.length <= MAX_ENCODED || detail === 'summary') {
      return { url: `https://wa.me/${digits}?text=${encoded}`, message, detail, truncated: detail !== 'full' };
    }
  }

  // Unreachable: 'summary' (the loop's last value) always satisfies the
  // condition above, so this only exists to give the function a provably
  // complete return type rather than `WhatsAppLink | undefined`.
  throw new Error('buildWhatsAppLink: no detail level produced a link — this should never happen');
}

/** Single-product "order this" link, bypassing the cart. */
export function productLink(
  { product, number, siteUrl }: { product: { name: string; price: number }; number: string | null | undefined; siteUrl?: string },
): WhatsAppLink {
  return buildWhatsAppLink({
    items: [{ key: 'single-product', name: product.name, price: product.price, qty: 1 }],
    number,
    siteUrl,
  });
}

/** Plain enquiry link for the floating button — no cart involved. */
export function enquiryLink(
  number: string | null | undefined,
  text: string = 'Hi! I saw your website and I’d like to ask about a gift bouquet.',
): string {
  return `https://wa.me/${normalizeNumber(number)}?text=${encodeURIComponent(text)}`;
}
