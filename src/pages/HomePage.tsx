import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { Icon } from '../components/ui/Icon';
import { LoadingLines } from '../components/ui/Spinner';
import { usePreferences } from '../context/PreferencesContext';
import { useDailyVerse } from '../hooks/useDailyVerse';
import { usePassage } from '../hooks/useScripture';
import { useStudyHistory } from '../hooks/useStudyHistory';
import { parseReference, referenceToPath } from '../lib/bible/reference';
import { SEARCH_EXAMPLES } from '../lib/search';
import { TOPICS } from '../data/topics';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const { translation } = usePreferences();
  const { data: daily } = useDailyVerse();
  const { data: dailyPassage, loading: dailyLoading } = usePassage(daily?.reference ?? null, translation);
  const { entries } = useStudyHistory();

  const featuredTopics = TOPICS.filter((topic) =>
    ['anxiety', 'purpose', 'forgiveness', 'hope', 'grief', 'guidance', 'peace', 'relationships'].includes(
      topic.slug,
    ),
  );

  return (
    <div className="container-page">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="glass animate-fade-up px-5 py-8 sm:px-8 sm:py-12">
        <h1 className="display text-[2rem] leading-[1.15] sm:text-[2.75rem] lg:text-[3.25rem]">
          Bible Verses Understood
        </h1>
        <p className="mt-3 text-ui-lg text-[rgb(var(--ink-on-dark))] sm:text-[1.25rem]">
          Understand the Word. Apply it to your life.
        </p>

        <div className="mt-7">
          <SearchBar value={query} onValueChange={setQuery} />
        </div>

        <div className="mt-5">
          <p className="text-ui-xs font-semibold uppercase tracking-wider muted">Try</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {SEARCH_EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(example);
                    document.getElementById('site-search')?.focus();
                  }}
                  className="btn btn-secondary min-h-0 px-3.5 py-2 text-ui-xs font-medium"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Three doors: Bible, Topics, Verse of the Day                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/bible"
          className="glass group flex flex-col gap-3 p-5 transition hover:border-white/30 hover:shadow-lift"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
            <Icon name="book" />
          </span>
          <span className="display text-xl">Browse the Bible</span>
          <span className="text-ui-sm muted">
            Old and New Testament, book by book and chapter by chapter. Choose any verse to
            understand it.
          </span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-ui-sm font-semibold text-[rgb(var(--gold))]">
            Open the Bible
            <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          to="/topics"
          className="glass group flex flex-col gap-3 p-5 transition hover:border-white/30 hover:shadow-lift"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
            <Icon name="layers" />
          </span>
          <span className="display text-xl">Explore Topics</span>
          <span className="text-ui-sm muted">
            {TOPICS.length} subjects — anxiety, purpose, forgiveness, money, grief — each with
            passages worth sitting with.
          </span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-ui-sm font-semibold text-[rgb(var(--gold))]">
            See all topics
            <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>

        <div className="glass flex flex-col gap-3 p-5 sm:col-span-2 lg:col-span-1">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
            <Icon name="sunrise" />
          </span>
          <span className="display text-xl">Verse of the Day</span>
          {dailyLoading || !dailyPassage ? (
            <LoadingLines lines={3} label="Loading today's verse" />
          ) : (
            <>
              <blockquote className="glass-light rounded-xl px-4 py-3">
                <p className="font-serif text-[1.0625rem] leading-[1.75rem] text-[rgb(var(--ink-on-light))]">
                  {truncate(dailyPassage.text, 190)}
                </p>
                <cite className="mt-2 block text-ui-xs font-semibold not-italic muted-on-light">
                  {dailyPassage.reference.reference} · {dailyPassage.translation}
                </cite>
              </blockquote>
              <Link to="/daily" className="btn btn-primary mt-auto w-full">
                Read today’s study
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Continue                                                            */}
      {/* ------------------------------------------------------------------ */}
      {entries.length > 0 ? (
        <section className="glass mt-5 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="display text-lg">Continue where you left off</h2>
            <Link to="/history" className="text-ui-sm font-medium text-[rgb(var(--gold))] hover:underline">
              All history
            </Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {entries.slice(0, 8).map((entry) => (
              <li key={`${entry.reference}-${entry.viewedAt}`}>
                <Link
                  to={pathForReference(entry.reference)}
                  state={{ source: 'history', resetTrail: true }}
                  className="btn btn-secondary min-h-0 px-3.5 py-2 text-ui-xs"
                >
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  {entry.reference}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* A few topics to start from                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-5">
        <div className="glass px-5 py-4">
          <h2 className="display text-lg">Start with what you are carrying</h2>
          <p className="mt-1 text-ui-sm muted">
            A few places people often begin. Every topic opens into passages you can study in full.
          </p>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featuredTopics.map((topic) => (
            <li key={topic.slug}>
              <Link
                to={`/topics/${topic.slug}`}
                className="glass flex h-full flex-col gap-1.5 p-4 transition hover:border-white/30"
              >
                <span className="display text-[1.0625rem]">{topic.name}</span>
                <span className="text-ui-xs leading-relaxed muted">{topic.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit);
  return `${text.slice(0, cut > 0 ? cut : limit)}…`;
}

/** History entries are stored as display references; link them back to a page. */
function pathForReference(reference: string): string {
  const parsed = parseReference(reference);
  return parsed ? referenceToPath(parsed) : '/';
}
