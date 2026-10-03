interface AccountLinkProps {
  name?: string;
  compact?: boolean;
}

/** Shown only when a customer is signed in — Header.astro decides that server-side. */
export default function AccountLink({ name, compact = false }: AccountLinkProps) {
  async function handleLogout() {
    await fetch('/api/account/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex items-center gap-3'}>
      <a href="/account" className="truncate text-sm font-medium text-ink-700 hover:text-blush-600">
        {name ? `Hi, ${name.split(' ')[0]}` : 'My account'}
      </a>
      <button type="button" onClick={handleLogout} className="text-xs text-ink-700/60 underline hover:text-blush-600">
        Sign out
      </button>
    </div>
  );
}
