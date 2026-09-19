const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** 1299 -> "₹1,299". Prices are stored as whole rupees, never floats. */
export function formatINR(amount) {
  return inr.format(Number(amount) || 0);
}

export function discountPercent(price, mrp) {
  if (!mrp || mrp <= price) return null;
  return Math.round(((mrp - price) / mrp) * 100);
}
