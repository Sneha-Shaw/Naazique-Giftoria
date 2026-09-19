import { useMemo, useState } from 'react';
import { addItem, cartOpen } from '../stores/cart.js';
import { formatINR } from '../lib/money.js';

const OCCASIONS = ['Birthday', 'Anniversary', 'Thank you', 'Congratulations', 'Just because'];
const NOTE_MAX = 120;

const STEPS = [
  { id: 'occasion', label: 'Occasion' },
  { id: 'chocolates', label: 'Chocolates' },
  { id: 'wrap', label: 'Wrap & extras' },
  { id: 'review', label: 'Review' },
];

export default function BouquetBuilder({ groups = {}, basePrice = 500 }) {
  const chocolates = groups.chocolate ?? [];
  const wraps = groups.wrap ?? [];
  const addons = groups.addon ?? [];

  const [step, setStep] = useState(0);
  const [occasion, setOccasion] = useState('');
  const [picked, setPicked] = useState({});           // { optionId: qty }
  const [wrapId, setWrapId] = useState(wraps[0]?.optionId ?? '');
  const [addonIds, setAddonIds] = useState([]);
  const [note, setNote] = useState('');
  const [added, setAdded] = useState(false);

  const wrap = wraps.find((w) => w.optionId === wrapId);
  const chosenAddons = addons.filter((a) => addonIds.includes(a.optionId));
  const chosenChocolates = chocolates
    .filter((c) => picked[c.optionId] > 0)
    .map((c) => ({ ...c, qty: picked[c.optionId] }));

  // Recomputed on every change so the running total is never stale — not knowing
  // the price until the end is the biggest drop-off point in a builder like this.
  const total = useMemo(() => {
    const choc = chosenChocolates.reduce((s, c) => s + c.priceDelta * c.qty, 0);
    const add = chosenAddons.reduce((s, a) => s + a.priceDelta, 0);
    return basePrice + choc + (wrap?.priceDelta ?? 0) + add;
  }, [chosenChocolates, chosenAddons, wrap, basePrice]);

  const chocolateCount = chosenChocolates.reduce((n, c) => n + c.qty, 0);
  const canAdvance = step !== 1 || chocolateCount > 0;

  function bump(optionId, delta) {
    setPicked((prev) => {
      const next = Math.max(0, (prev[optionId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[optionId];
      else copy[optionId] = next;
      return copy;
    });
  }

  function toggleAddon(optionId) {
    setAddonIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }

  function handleAdd() {
    const parts = [
      wrap && { label: 'Wrap', value: wrap.label },
      chosenChocolates.length && {
        label: 'Chocolates',
        value: chosenChocolates.map((c) => `${c.label} ×${c.qty}`).join(', '),
      },
      chosenAddons.length && { label: 'Add-ons', value: chosenAddons.map((a) => a.label).join(', ') },
      occasion && { label: 'Occasion', value: occasion },
    ].filter(Boolean);

    addItem({
      // Unique key: two custom bouquets are rarely the same, so they must not merge.
      key: `custom:${Date.now()}`,
      type: 'custom',
      name: 'Custom Bouquet',
      price: total,
      qty: 1,
      parts,
      note: note.trim() || undefined,
    });

    setAdded(true);
    cartOpen.set(true);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {/* Step rail */}
        <ol className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                aria-current={i === step ? 'step' : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  i === step
                    ? 'bg-blush-500 text-white'
                    : i < step
                      ? 'bg-blush-100 text-blush-700'
                      : 'cursor-not-allowed text-ink-700/40'
                }`}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-2xl border border-blush-100 bg-white p-5 sm:p-6">
          {step === 0 && (
            <fieldset>
              <legend className="font-display text-lg font-semibold text-ink-900">
                What's the occasion?
              </legend>
              <p className="mt-1 text-sm text-ink-700">Optional — it helps us pick the right finishing touches.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOccasion(occasion === o ? '' : o)}
                    aria-pressed={occasion === o}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      occasion === o
                        ? 'border-blush-500 bg-blush-500 text-white'
                        : 'border-blush-200 text-ink-700 hover:bg-blush-50'
                    }`}
                  >{o}</button>
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="font-display text-lg font-semibold text-ink-900">Pick your chocolates</legend>
              <p className="mt-1 text-sm text-ink-700">Mix as many as you like. Most bouquets use 8–16 pieces.</p>
              <ul className="mt-4 divide-y divide-blush-100">
                {chocolates.map((c) => (
                  <li key={c.optionId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">{c.label}</p>
                      <p className="text-xs text-ink-700">+{formatINR(c.priceDelta)} each</p>
                    </div>
                    <div className="flex items-center rounded-full border border-blush-200">
                      <button type="button" onClick={() => bump(c.optionId, -1)}
                        aria-label={`Fewer ${c.label}`}
                        className="px-3 py-1.5 text-ink-700 hover:text-blush-600">−</button>
                      <span className="min-w-7 text-center text-sm tabular-nums">{picked[c.optionId] ?? 0}</span>
                      <button type="button" onClick={() => bump(c.optionId, 1)}
                        aria-label={`More ${c.label}`}
                        className="px-3 py-1.5 text-ink-700 hover:text-blush-600">+</button>
                    </div>
                  </li>
                ))}
              </ul>
              {chocolateCount === 0 && (
                <p className="mt-3 text-sm text-blush-600">Add at least one chocolate to continue.</p>
              )}
            </fieldset>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <fieldset>
                <legend className="font-display text-lg font-semibold text-ink-900">Wrap colour</legend>
                <div className="mt-4 flex flex-wrap gap-3">
                  {wraps.map((w) => (
                    <button
                      key={w.optionId}
                      type="button"
                      onClick={() => setWrapId(w.optionId)}
                      aria-pressed={wrapId === w.optionId}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                        wrapId === w.optionId ? 'border-blush-500 ring-2 ring-blush-200' : 'border-blush-200 hover:bg-blush-50'
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ background: w.swatch ?? '#f2e8d9' }}
                        aria-hidden="true"
                      />
                      {w.label}
                      {w.priceDelta > 0 && <span className="text-xs text-ink-700">+{formatINR(w.priceDelta)}</span>}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-display text-lg font-semibold text-ink-900">Add-ons</legend>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {addons.map((a) => (
                    <label key={a.optionId}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        addonIds.includes(a.optionId) ? 'border-blush-500 bg-blush-50' : 'border-blush-200 hover:bg-blush-50'
                      }`}>
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.optionId)}
                        onChange={() => toggleAddon(a.optionId)}
                        className="h-4 w-4 accent-blush-500"
                      />
                      <span className="flex-1 text-sm font-medium text-ink-900">{a.label}</span>
                      <span className="text-xs text-ink-700">+{formatINR(a.priceDelta)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Add a personal note</h2>
              <p className="mt-1 text-sm text-ink-700">We'll write this on the gift card by hand.</p>
              <textarea
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Happy birthday, Aisha!"
                className="mt-3 w-full rounded-xl border border-blush-200 p-3 text-sm focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-200"
              />
              <p className="mt-1 text-right text-xs text-ink-700/70">{note.length}/{NOTE_MAX}</p>

              <div className="mt-6 rounded-xl bg-cream-100 p-4 text-sm text-ink-700">
                <p className="font-medium text-ink-900">What happens next</p>
                <p className="mt-1">
                  This goes to us as a WhatsApp message. We'll confirm it's doable, give you a final
                  quote and a delivery date, then send a UPI QR.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}
                className="rounded-full border border-blush-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-blush-50">
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => canAdvance && setStep(step + 1)} disabled={!canAdvance}
                className="ml-auto rounded-full bg-blush-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blush-600 disabled:cursor-not-allowed disabled:opacity-40">
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleAdd}
                className="ml-auto rounded-full bg-blush-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blush-600">
                {added ? 'Added ✓' : 'Add to basket'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live preview + running total. Sticky on desktop, pinned to the bottom on phones. */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-blush-100 bg-white p-5">
          <div
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl p-4 transition-colors duration-300"
            style={{ background: wrap?.swatch ?? '#f2e8d9' }}
          >
            {chosenChocolates.length === 0 ? (
              <p className="text-center text-sm text-ink-900/50">Your bouquet appears here</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-1.5">
                {chosenChocolates.flatMap((c) =>
                  Array.from({ length: Math.min(c.qty, 12) }, (_, i) => (
                    <span key={`${c.optionId}-${i}`}
                      className="rounded-full bg-white/85 px-2 py-1 text-[10px] font-medium text-ink-900 shadow-sm">
                      {c.label}
                    </span>
                  )),
                )}
              </div>
            )}
            {chosenAddons.length > 0 && (
              <p className="mt-1 text-center text-[11px] text-ink-900/70">
                + {chosenAddons.map((a) => a.label).join(', ')}
              </p>
            )}
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-700">
              <dt>Base arrangement</dt><dd>{formatINR(basePrice)}</dd>
            </div>
            {chocolateCount > 0 && (
              <div className="flex justify-between text-ink-700">
                <dt>{chocolateCount} chocolate{chocolateCount === 1 ? '' : 's'}</dt>
                <dd>{formatINR(chosenChocolates.reduce((s, c) => s + c.priceDelta * c.qty, 0))}</dd>
              </div>
            )}
            {wrap?.priceDelta > 0 && (
              <div className="flex justify-between text-ink-700"><dt>{wrap.label} wrap</dt><dd>{formatINR(wrap.priceDelta)}</dd></div>
            )}
            {chosenAddons.map((a) => (
              <div key={a.optionId} className="flex justify-between text-ink-700"><dt>{a.label}</dt><dd>{formatINR(a.priceDelta)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-blush-100 pt-2 font-display text-lg font-semibold text-ink-900">
              <dt>Estimated total</dt><dd aria-live="polite">{formatINR(total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-700/70">
            An estimate — we confirm the final price on WhatsApp before you pay.
          </p>
        </div>
      </aside>
    </div>
  );
}
