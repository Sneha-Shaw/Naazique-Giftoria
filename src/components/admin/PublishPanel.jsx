import { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi.js';
import Toast from './Toast.jsx';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function PublishPanel() {
  const [diff, setDiff] = useState(null);
  const [revisions, setRevisions] = useState(null);
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadAll() {
    try {
      const [d, r] = await Promise.all([
        adminFetch('/api/admin/diff'),
        adminFetch('/api/admin/revisions'),
      ]);
      setDiff(d);
      setRevisions(r.revisions);
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    }
  }

  useEffect(() => { loadAll(); }, []);

  const hasChanges = diff && (diff.added.length || diff.removed.length || diff.priceChanges.length || !diff.hasPreviousRevision);

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await adminFetch('/api/admin/publish', { method: 'POST', body: JSON.stringify({ note }) });
      setNote('');
      if (res.warning) {
        setToast({ message: res.warning, tone: 'info' });
      } else {
        setToast({ message: 'Published — live in about 2 minutes.', tone: 'success' });
      }
      loadAll();
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setPublishing(false);
    }
  }

  async function handleRestore(id) {
    if (!confirm('Restore this version? The current catalogue will be replaced (nothing is deleted — it just gets archived).')) return;
    setRestoringId(id);
    try {
      await adminFetch(`/api/admin/revisions/${id}/restore`, { method: 'POST' });
      setToast({ message: 'Restored — live in about 2 minutes.', tone: 'success' });
      loadAll();
    } catch (err) {
      setToast({ message: err.message, tone: 'error' });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="pb-10">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Publish</h1>
      <p className="mt-1 text-sm text-ink-700">
        Changes you make in Products, Builder, Gallery and Settings save instantly here, but customers
        won't see them until you publish.
      </p>

      <section className="mt-6 rounded-2xl border border-blush-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink-900">What's changed</h2>
        {!diff ? (
          <p className="mt-2 text-sm text-ink-700">Checking…</p>
        ) : !hasChanges ? (
          <p className="mt-2 text-sm text-ink-700">Nothing has changed since the last publish.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {diff.added.map((p) => (
              <li key={`add-${p.slug}`} className="flex gap-2 text-emerald-700"><span>+</span>{p.name} added</li>
            ))}
            {diff.removed.map((p) => (
              <li key={`rm-${p.slug}`} className="flex gap-2 text-blush-600"><span>−</span>{p.name} removed</li>
            ))}
            {diff.priceChanges.map((p) => (
              <li key={`px-${p.slug}`} className="flex gap-2 text-ink-700">
                <span>~</span>{p.name}: ₹{p.from} → ₹{p.to}
              </li>
            ))}
            {!diff.hasPreviousRevision && (
              <li className="text-ink-700">First publish — {diff.currentCount} product{diff.currentCount === 1 ? '' : 's'} will go live.</li>
            )}
          </ul>
        )}

        <label className="mt-4 block">
          <span className="text-sm font-medium text-ink-900">Note (optional)</span>
          <input
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added Diwali specials"
            className="mt-1 w-full rounded-xl border border-blush-200 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button" onClick={handlePublish} disabled={publishing}
          className="mt-4 w-full rounded-full bg-blush-500 px-5 py-3.5 text-base font-semibold text-white transition hover:bg-blush-600 disabled:opacity-60"
        >
          {publishing ? 'Publishing…' : 'Publish to site'}
        </button>
        <p className="mt-2 text-center text-xs text-ink-700/70">Takes about 2 minutes to go live.</p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink-900">History</h2>
        {!revisions ? (
          <p className="mt-2 text-sm text-ink-700">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700">Nothing published yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-blush-100 overflow-hidden rounded-2xl border border-blush-100 bg-white">
            {revisions.map((r, i) => (
              <li key={r._id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{fmtDate(r.publishedAt)}</p>
                  <p className="truncate text-xs text-ink-700">{r.note || 'No note'} · by {r.publishedBy}</p>
                </div>
                {i === 0 ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Current</span>
                ) : (
                  <button
                    type="button" onClick={() => handleRestore(r._id)} disabled={restoringId === r._id}
                    className="shrink-0 rounded-full border border-blush-200 px-3 py-1.5 text-xs font-medium text-blush-700 disabled:opacity-60"
                  >
                    {restoringId === r._id ? 'Restoring…' : 'Restore'}
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
