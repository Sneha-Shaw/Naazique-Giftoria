interface LogoutButtonProps {
  className?: string;
}

export default function LogoutButton({ className = '' }: LogoutButtonProps) {
  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }
  return (
    <button type="button" onClick={handleLogout} className={className}>
      Sign out
    </button>
  );
}
