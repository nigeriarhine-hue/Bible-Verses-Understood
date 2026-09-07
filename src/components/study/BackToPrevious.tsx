import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import type { TrailStep } from '../../lib/storage';

/**
 * "← Back to Romans 8:28".
 *
 * Deliberately given its own high-contrast pill with a blurred backing: this
 * control sits above the fold, over open sky, and must never wash out.
 */
export function BackToPrevious({ step }: { step: TrailStep | null }) {
  if (!step) return null;
  return (
    <Link
      to={step.path}
      state={{ source: 'history' }}
      className="glass-pill transition hover:border-white/45 hover:bg-[rgb(var(--glass-dark))]"
    >
      <Icon name="arrow-left" className="h-4 w-4 shrink-0" />
      <span className="truncate">Back to {step.reference}</span>
    </Link>
  );
}
