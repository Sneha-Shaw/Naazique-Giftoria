import { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import type { RevisionListItem } from '../../lib/revisions.js';
import Toast, { type ToastState } from './Toast.js';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * There's no "Publish" step anymore — every save in Products, Gallery and
 * Settings is live the instant it's saved (the site reads MongoDB directly,
 * per request). What used to be the manual publish button now happens
 * automatically on every save: a checkpoint, so a mistake can be undone.
 * This page is just that history, plus Restore.
 */
export default function HistoryPanel() {
  const [checkpoints, setCheckpoints] = useState<RevisionListItem[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function load() {
    try {
      const { revisions } = await adminFetch<{ revisions: RevisionListItem[] }>('/api/admin/revisions');
      setCheckpoints(revisions);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(id: string) {
    if (!confirm('Restore this checkpoint? The current catalogue will be replaced right away (nothing is deleted — anything not in this checkpoint just gets archived).')) return;
    setRestoringId(id);
    try {
      await adminFetch(`/api/admin/revisions/${id}/restore`, { method: 'POST' });
      setToast({ message: 'Restored — live now.', tone: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), tone: 'error' });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="pb-10">
      <h1 className="font-display text-2xl font-semibold text-ink-900">History</h1>
      <p className="mt-1 text-sm text-ink-700">
        Every save in Products, Gallery and Settings is live right away — there's nothing to publish.
        This is a checkpoint of each one, in case you need to undo something.
      </p>

      <section className="mt-6">
        {!checkpoints ? (
          <p className="text-sm text-ink-700">Loading…</p>
        ) : checkpoints.length === 0 ? (
          <p className="rounded-xl border border-dashed border-blush-200 p-8 text-center text-sm text-ink-700">
            Nothing saved yet.
          </p>
        ) : (
          <ul className="divide-y divide-blush-100 overflow-hidden rounded-2xl border border-blush-100 bg-white">
            {checkpoints.map((c, i) => (
              <li key={c._id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{fmtDate(c.publishedAt)}</p>
                  <p className="truncate text-xs text-ink-700">{c.note || 'Saved'} · by {c.publishedBy}</p>
                </div>
                {i === 0 ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Current</span>
                ) : (
                  <button
                    type="button" onClick={() => handleRestore(c._id)} disabled={restoringId === c._id}
                    className="shrink-0 rounded-full border border-blush-200 px-3 py-1.5 text-xs font-medium text-blush-700 disabled:opacity-60"
                  >
                    {restoringId === c._id ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
