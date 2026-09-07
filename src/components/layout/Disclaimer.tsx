/**
 * The AI disclaimer.
 *
 * Required to be plainly readable: it sits on its own glass panel at 14px with
 * comfortable line height, never as faint text over the sky.
 */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={`glass px-4 py-3.5 sm:px-5 ${compact ? '' : 'sm:py-4'}`}
      aria-label="About the explanations on this site"
    >
      <p className="text-ui-xs leading-[1.6] text-[rgb(var(--ink-on-dark))]">
        <span className="font-semibold">Bible Verses Understood</span> uses AI to support Scripture
        study, reflection, and understanding. AI-generated explanations may contain errors and may
        reflect interpretations that differ across Christian traditions. Commentary is not Scripture
        and is not a substitute for trusted pastoral, theological, or professional guidance when
        needed.
      </p>
    </aside>
  );
}
