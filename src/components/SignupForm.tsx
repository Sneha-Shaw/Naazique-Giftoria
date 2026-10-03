import { useState, type SubmitEvent } from 'react';

interface SignupFormProps {
  next?: string;
}

export default function SignupForm({ next = '/account' }: SignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/account/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password }),
      });
      const data: { error?: string } = await res.json();
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
    <form onSubmit={handleSubmit} className="mx-auto mt-8 w-full max-w-sm space-y-4 px-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink-900">Name</label>
        <input
          id="name" required value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-900">Email</label>
        <input
          id="email" type="email" required autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-ink-900">WhatsApp number</label>
        <input
          id="phone" required inputMode="numeric" value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Country code + number — e.g. 919876543210"
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink-900">Password</label>
        <input
          id="password" type="password" required minLength={8} autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-blush-200 px-4 py-3 text-base focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
        />
        <p className="mt-1 text-xs text-ink-700/70">At least 8 characters.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-blush-100 px-3 py-2 text-sm text-blush-700">{error}</p>
      )}
      <button
        type="submit" disabled={busy}
        className="w-full rounded-full bg-blush-500 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-blush-600 disabled:opacity-60"
      >
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-center text-sm text-ink-700">
        Already have an account? <a href="/account/login" className="font-medium text-blush-600 underline">Sign in</a>
      </p>
    </form>
  );
}
