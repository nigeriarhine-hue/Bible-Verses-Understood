import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { topicIcon } from '../components/ui/icon-paths';
import { trackEvent } from '../lib/analytics';
import { TOPICS } from '../data/topics';

export default function TopicsPage() {
  // A search the home page could not place arrives here with what was typed,
  // so the reader sees it applied rather than having to type it again.
  const handedOver = (useLocation().state as { query?: string } | null)?.query ?? '';
  const [filter, setFilter] = useState(handedOver);
  const query = filter.trim().toLowerCase();

  const topics = useMemo(() => {
    if (!query) return TOPICS;
    return TOPICS.filter(
      (topic) =>
        topic.name.toLowerCase().includes(query) || topic.description.toLowerCase().includes(query),
    );
  }, [query]);

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">Explore Topics</h1>
        <p className="mt-2 text-ui-base muted">
          {TOPICS.length} subjects, each with passages worth sitting with. Every reference opens into
          a full study.
        </p>
        <div className="relative mt-4">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 muted"
          />
          <label htmlFor="topic-filter" className="sr-only">
            Find a topic
          </label>
          <input
            id="topic-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a topic…"
            className="field pl-12"
          />
        </div>
      </header>

      {topics.length === 0 ? (
        <div className="glass p-6">
          <p className="text-ui-base">
            No topic matches “{filter.trim()}”. Try a single word — “grief”, “patience”,
            “forgiveness” — or search for a verse or chapter by reference.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link
                to={`/topics/${topic.slug}`}
                onClick={() => trackEvent('topic_selected', { topic: topic.slug, from: 'topics_index' })}
                className="glass group flex h-full flex-col gap-2 p-5 transition hover:border-white/30 hover:shadow-lift"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-[rgb(var(--gold))]">
                  <Icon name={topicIcon(topic.icon)} />
                </span>
                <span className="display text-[1.1875rem]">{topic.name}</span>
                <span className="text-ui-sm leading-relaxed muted">{topic.description}</span>
                <span className="mt-auto pt-2 text-ui-xs font-semibold text-[rgb(var(--gold))]">
                  {topic.verses.length} passages →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
