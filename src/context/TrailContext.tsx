import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadTrail, saveTrail, type TrailStep } from '../lib/storage';

/**
 * The study trail.
 *
 * Following Related Scripture from Romans 8:28 to Genesis 50:20 to Proverbs
 * 19:21 should feel like walking forward through a study, with a way back at
 * every step. The trail is kept here (and mirrored into local storage so a
 * refresh does not lose the reader's place); signed-in readers also get it
 * written to study_navigation.
 */

interface TrailContextValue {
  trail: TrailStep[];
  /** The step to go back to, if there is one. */
  previous: TrailStep | null;
  /** Records arriving at a passage. Returns the step we came from, if any. */
  visit: (step: TrailStep, options?: { reset?: boolean }) => TrailStep | null;
  goBack: () => void;
  reset: () => void;
}

const TrailContext = createContext<TrailContextValue | null>(null);

export function TrailProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<TrailStep[]>(loadTrail);

  const commit = useCallback((next: TrailStep[]) => {
    setTrail(next);
    saveTrail(next);
    return next;
  }, []);

  const visit = useCallback<TrailContextValue['visit']>(
    (step, options) => {
      let cameFrom: TrailStep | null = null;
      setTrail((current) => {
        if (options?.reset) {
          const next = [step];
          saveTrail(next);
          return next;
        }
        const last = current[current.length - 1];
        if (last && last.path === step.path) {
          // Same passage, perhaps a different translation — keep the trail.
          const next = [...current.slice(0, -1), step];
          saveTrail(next);
          cameFrom = current[current.length - 2] ?? null;
          return next;
        }
        const secondLast = current[current.length - 2];
        if (secondLast && secondLast.path === step.path) {
          // The reader went back a step.
          const next = current.slice(0, -1);
          saveTrail(next);
          cameFrom = next[next.length - 2] ?? null;
          return next;
        }
        cameFrom = last ?? null;
        const next = [...current, step];
        saveTrail(next);
        return next;
      });
      return cameFrom;
    },
    [],
  );

  const goBack = useCallback(() => {
    setTrail((current) => {
      const next = current.slice(0, -1);
      saveTrail(next);
      return next;
    });
  }, []);

  const value = useMemo<TrailContextValue>(
    () => ({
      trail,
      previous: trail.length > 1 ? trail[trail.length - 2] : null,
      visit,
      goBack,
      reset: () => commit([]),
    }),
    [trail, visit, goBack, commit],
  );

  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrail(): TrailContextValue {
  const context = useContext(TrailContext);
  if (!context) throw new Error('useTrail must be used inside TrailProvider');
  return context;
}
