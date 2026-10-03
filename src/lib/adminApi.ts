/**
 * Thin fetch wrapper shared by every admin island. A 401 here means the
 * session cookie expired mid-visit (7-day TTL) — bounce to login rather than
 * showing a confusing "failed to save" toast.
 *
 * Generic over the expected response shape rather than `any`: each call site
 * (e.g. `adminFetch<{ products: Product[] }>(...)`) says what it actually
 * expects back, instead of silently accepting anything.
 */
export async function adminFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : undefined;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data as T;
}
