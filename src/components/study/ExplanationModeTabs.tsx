import { EXPLANATION_MODES, type ExplanationMode } from '../../lib/ai/types';

/**
 * Simple / Deep / Scholar.
 *
 * The labels are exactly what a reader is choosing between — no "AI" prefix.
 */
export function ExplanationModeTabs({
  mode,
  onChange,
}: {
  mode: ExplanationMode;
  onChange: (mode: ExplanationMode) => void;
}) {
  return (
    <div className="glass p-1.5" role="tablist" aria-label="Explanation depth">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {EXPLANATION_MODES.map((entry) => {
          const active = entry.id === mode;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(entry.id)}
              className={`rounded-xl px-4 py-3 text-left transition ${
                active
                  ? 'bg-[rgb(var(--gold))] text-[#241701] shadow-lift'
                  : 'text-[rgb(var(--ink-on-dark))] hover:bg-white/10'
              }`}
            >
              <span className="block text-ui-sm font-semibold">{entry.label}</span>
              <span
                className={`mt-0.5 block text-ui-xs leading-snug ${
                  active ? 'text-[#3a2a08]' : 'text-[rgb(var(--ink-on-dark-muted))]'
                }`}
              >
                {entry.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
