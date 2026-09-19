/**
 * Thin fetch wrapper shared by every admin island. A 401 here means the
 * session cookie expired mid-visit (7-day TTL) — bounce to login rather than
 * showing a confusing "failed to save" toast.
 */
export async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
