import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';
import { referenceToPath } from '../lib/bible/reference';
import { detectIntent } from '../lib/search';
import { Icon } from './ui/Icon';

interface SearchBarProps {
  autoFocus?: boolean;
  initialValue?: string;
  size?: 'large' | 'compact';
  placeholder?: string;
  /** Optional controlled value, so example chips can fill the field. */
  value?: string;
  onValueChange?: (value: string) => void;
}

/**
 * One field for everything: a verse, a passage, a chapter, a topic, a question,
 * or a sentence about what someone is facing.
 */
export function SearchBar({
  autoFocus = false,
  initialValue = '',
  size = 'large',
  placeholder = "Search a Bible verse, topic, or something you're facing...",
  value,
  onValueChange,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const query = value ?? internalQuery;
  const setQuery = (next: string) => {
    setInternalQuery(next);
    onValueChange?.(next);
  };
  const navigate = useNavigate();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = detectIntent(query);
    if (!intent) return;

    // Analytics records the *kind* of search, never what someone typed about
    // their own life.
    if (intent.kind === 'reference') {
      trackEvent('verse_search', { intent: 'reference', reference: intent.reference.reference });
      navigate(referenceToPath(intent.reference), { state: { source: 'search', resetTrail: true } });
      return;
    }
    if (intent.kind === 'topic') {
      trackEvent('verse_search', { intent: 'topic', topic: intent.slug });
      navigate(`/topics/${intent.slug}`);
      return;
    }
    // The query travels in route state, not in the analytics event: what a
    // reader types is theirs, and the rule at the top of analytics.ts holds.
    trackEvent('verse_search', { intent: 'browse' });
    navigate('/topics', { state: { query: intent.query } });
  };

  const large = size === 'large';

  return (
    <form onSubmit={onSubmit} role="search" className="w-full">
      <label htmlFor="site-search" className="sr-only">
        Search a Bible verse, topic, or something you are facing
      </label>
      <div className="relative">
        <Icon
          name="search"
          className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--ink-on-dark-muted))] ${
            large ? 'h-5 w-5 sm:left-5' : 'h-5 w-5'
          }`}
        />
        <input
          id="site-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={placeholder}
          className={`field pr-[6.5rem] ${
            large ? 'py-4 pl-12 text-ui-lg sm:pl-14 sm:text-[1.125rem]' : 'py-3 pl-11'
          }`}
        />
        <button
          type="submit"
          className="btn btn-primary absolute right-1.5 top-1/2 h-[calc(100%-0.75rem)] -translate-y-1/2 px-4 sm:px-5"
          disabled={query.trim().length === 0}
        >
          <span className="hidden sm:inline">Search</span>
          <Icon name="arrow-right" className="h-4 w-4 sm:hidden" />
          <span className="sr-only sm:hidden">Search</span>
        </button>
      </div>
    </form>
  );
}
