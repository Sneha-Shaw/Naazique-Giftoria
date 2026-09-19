import { useEffect } from 'react';

/** Simple dismissable toast. `tone` picks the color; auto-dismisses success after a few seconds. */
export default function Toast({ message, tone = 'success', onDismiss }) {
  useEffect(() => {
    if (tone !== 'success') return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [message, tone, onDismiss]);

  if (!message) return null;

  const styles = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-blush-100 text-blush-700 border-blush-200',
    info: 'bg-cream-100 text-ink-700 border-blush-100',
  };

  return (
    <div
      role="status"
      className={`fixed inset-x-4 bottom-20 z-30 mx-auto max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg lg:bottom-6 ${styles[tone]}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{message}</span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 font-semibold">✕</button>
      </div>
    </div>
  );
}
