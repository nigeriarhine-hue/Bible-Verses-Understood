import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import type { TrailStep } from '../../lib/storage';

/**
 * The path a reader has taken: Romans 8:28 → Genesis 50:20 → Proverbs 19:21.
 * Every step stays clickable, so nobody has to go back to the home page to
 * pick the thread up again.
 */
export function StudyTrail({ trail }: { trail: TrailStep[] }) {
  if (trail.length < 2) return null;

  return (
    <nav aria-label="Your study trail" className="glass px-3 py-2.5">
      <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {trail.map((step, index) => {
          const isCurrent = index === trail.length - 1;
          return (
            <li key={`${step.path}-${index}`} className="flex shrink-0 items-center gap-1">
              {index > 0 ? (
                <Icon name="chevron-right" className="h-3.5 w-3.5 shrink-0 muted" />
              ) : null}
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="rounded-full bg-white/12 px-3 py-1.5 text-ui-xs font-semibold"
                >
                  {step.reference}
                </span>
              ) : (
                <Link
                  to={step.path}
                  className="rounded-full px-3 py-1.5 text-ui-xs font-medium muted transition hover:bg-white/10 hover:text-[rgb(var(--ink-on-dark))]"
                >
                  {step.reference}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
