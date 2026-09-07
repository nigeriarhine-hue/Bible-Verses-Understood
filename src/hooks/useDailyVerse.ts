import { useEffect, useState } from 'react';
import { dailyVerseFor, isoDate } from '../data/daily-verses';
import { parseReference } from '../lib/bible/reference';
import type { BibleReference } from '../lib/bible/types';
import { cacheGet, cacheSet, HOUR } from '../lib/cache';
import { supabase } from '../lib/supabase';

interface DailyVerse {
  date: string;
  reference: BibleReference;
  featuredNote: string | null;
}

/**
 * The Verse of the Day.
 *
 * A `daily_verses` row is an editor's choice and wins when one exists. With no
 * database — or no row for today — the verse is computed from the same curated
 * pool the seed was generated from, so the Verse of the Day always works and
 * always agrees with what the database would have said.
 */
export function useDailyVerse(date = new Date()) {
  const day = isoDate(date);
  const [state, setState] = useState<{ data: DailyVerse | null; loading: boolean }>({
    data: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    const fallback = (): DailyVerse | null => {
      const reference = parseReference(dailyVerseFor(date));
      return reference ? { date: day, reference, featuredNote: null } : null;
    };

    const cached = cacheGet<{ reference: string; featuredNote: string | null }>(`bvu:daily:${day}`);
    if (cached) {
      const reference = parseReference(cached.reference);
      if (reference) {
        setState({ data: { date: day, reference, featuredNote: cached.featuredNote }, loading: false });
        return;
      }
    }

    if (!supabase) {
      setState({ data: fallback(), loading: false });
      return;
    }

    supabase
      .from('daily_verses')
      .select('reference, featured_note')
      .eq('verse_date', day)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const reference = data?.reference ? parseReference(data.reference) : null;
        if (reference) {
          cacheSet(`bvu:daily:${day}`, { reference: data!.reference, featuredNote: data!.featured_note }, HOUR * 12);
          setState({ data: { date: day, reference, featuredNote: data!.featured_note }, loading: false });
        } else {
          setState({ data: fallback(), loading: false });
        }
      })
      .then(undefined, () => {
        if (active) setState({ data: fallback(), loading: false });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return state;
}
