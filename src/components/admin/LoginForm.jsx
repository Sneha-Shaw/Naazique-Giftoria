import { useState } from 'react';

export default function LoginForm({ next = '/admin/products' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      window.location.href = next;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-10 w-full max-w-sm space-y-4 px-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-900">Email</label>
        <input
          id="email" type="email" required autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink-900">Password</label>
        <input
          id="password" type="password" required autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-blush-100 px-3 py-2 text-sm text-blush-700">{error}</p>
      )}
      <button
        type="submit" disabled={busy}
        className="w-full rounded-full bg-blush-500 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-blush-600 disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
