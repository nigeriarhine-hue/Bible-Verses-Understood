import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { topicIcon } from '../components/ui/icon-paths';
import { usePreferences } from '../context/PreferencesContext';
import { trackEvent } from '../lib/analytics';
import { getPassage } from '../lib/bible/provider';
import { parseReference, referenceToPath } from '../lib/bible/reference';
import type { BibleReference } from '../lib/bible/types';
import { supabase } from '../lib/supabase';
import { TOPICS_BY_SLUG, type TopicVerseSeed } from '../data/topics';

interface ResolvedVerse {
  reference: BibleReference;
  note: string;
  preview: string;
}

/**
 * A topic and its passages.
 *
 * Verses come from the database when it is configured, and from the bundled
 * catalogue otherwise, so a topic page is never empty. Each one is retrieved
 * from Scripture before it is listed.
 */
export default function TopicPage() {
  const { slug } = useParams();
  const { translation } = usePreferences();
  const topic = slug ? TOPICS_BY_SLUG.get(slug) : undefined;
  const [verses, setVerses] = useState<ResolvedVerse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (topic) trackEvent('topic_selected', { topic: topic.slug, from: 'topic_page' });
  }, [topic]);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);

    const resolve = async (seeds: TopicVerseSeed[]) => {
      const results = await Promise.all(
        seeds.map(async (seed) => {
          const reference = parseReference(seed.reference, { strict: true });
          if (!reference) return null;
          try {
            const passage = await getPassage(reference, translation);
            return {
              reference: passage.reference,
              note: seed.relevanceNote,
              preview: passage.text,
            } satisfies ResolvedVerse;
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      setVerses(results.filter((entry): entry is ResolvedVerse => entry !== null));
      setLoading(false);
    };

    const fallback = TOPICS_BY_SLUG.get(slug)?.verses ?? [];

    if (!supabase) {
      void resolve(fallback);
      return () => {
        active = false;
      };
    }

    supabase
      .from('topics')
      .select('id, topic_verses(reference, relevance_note, sort_order)')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        const rows = (data as { topic_verses?: Array<{ reference: string; relevance_note: string | null; sort_order: number }> } | null)
          ?.topic_verses;
        if (rows && rows.length > 0) {
          void resolve(
            [...rows]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((row) => ({ reference: row.reference, relevanceNote: row.relevance_note ?? '' })),
          );
        } else {
          void resolve(fallback);
        }
      })
      .then(undefined, () => {
        void resolve(fallback);
      });

    return () => {
      active = false;
    };
  }, [slug, translation]);

  if (!topic) {
    return (
      <div className="container-page py-10">
        <div className="glass mx-auto max-w-lg p-6">
          <h1 className="display text-2xl">We do not have that topic</h1>
          <p className="mt-3 text-ui-base muted">
            It may have been renamed. Browse the full list to find what you are looking for.
          </p>
          <Link to="/topics" className="btn btn-primary mt-5">
            All topics
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page space-y-4 pb-6">
      <Link to="/topics" className="glass-pill transition hover:border-white/45">
        <Icon name="arrow-left" className="h-4 w-4" />
        All topics
      </Link>

      <header className="glass px-5 py-6 sm:px-7">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
          <Icon name={topicIcon(topic.icon)} className="h-6 w-6" />
        </span>
        <h1 className="display mt-3 text-[1.75rem] leading-tight sm:text-[2.25rem]">{topic.name}</h1>
        <p className="mt-2 text-ui-lg muted">{topic.description}</p>
      </header>

      {loading ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {topic.verses.map((verse) => (
            <li key={verse.reference} className="glass h-44 p-5">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton mt-3 h-3 w-full" />
              <div className="skeleton mt-2 h-3 w-5/6" />
              <div className="skeleton mt-2 h-3 w-2/3" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {verses.map((verse) => (
            <li key={verse.reference.reference}>
              <Link
                to={referenceToPath(verse.reference)}
                state={{ source: 'topic', resetTrail: true }}
                className="glass group flex h-full flex-col gap-3 p-5 transition hover:border-white/35 hover:shadow-lift"
              >
                <span className="display text-[1.0625rem] text-[rgb(var(--gold))]">
                  {verse.reference.reference}
                </span>
                <span className="glass-light block rounded-xl px-3.5 py-3">
                  <span className="block font-serif text-[0.97rem] leading-[1.65rem] text-[rgb(var(--ink-on-light))]">
                    “{shorten(verse.preview, 180)}”
                  </span>
                </span>
                {verse.note ? (
                  <span className="text-ui-sm leading-relaxed muted">{verse.note}</span>
                ) : null}
                <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-ui-sm font-semibold text-[rgb(var(--gold))]">
                  Understand This Verse
                  <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Something more specific?</h2>
        <p className="mt-2 text-ui-base muted">
          If you are facing something particular rather than reading around a subject, describe it in
          your own words and we will find a passage that speaks to it.
        </p>
        <Link to="/guidance" className="btn btn-primary mt-4">
          Describe what you are facing
        </Link>
      </section>
    </div>
  );
}

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit);
  return `${text.slice(0, cut > 0 ? cut : limit)}…`;
}
