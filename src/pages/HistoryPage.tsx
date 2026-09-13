import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useStudyHistory } from '../hooks/useStudyHistory';
import { parseReference, referenceToPath } from '../lib/bible/reference';

const SOURCE_LABEL: Record<string, string> = {
  search: 'Searched',
  related_scripture: 'Followed from a related passage',
  topic: 'From a topic',
  daily: 'Verse of the Day',
  history: 'Revisited',
  saved: 'From your saved verses',
  // Nothing writes this any more — life-situation guidance was removed — but
  // rows recorded before that still carry it, and they deserve a sentence
  // rather than a blank.
  life_situation: 'From a life-situation search',
  browse: 'While reading a chapter',
};

export default function HistoryPage() {
  const { entries, loading, clear } = useStudyHistory();
  const { user } = useAuth();

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">Study history</h1>
        <p className="mt-2 text-ui-base muted">
          {user
            ? 'Everything you have studied, kept with your account.'
            : 'Kept in this browser only — nothing is sent anywhere while you are signed out.'}
        </p>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => void clear()}
            className="btn btn-secondary mt-4 min-h-0 px-3.5 py-2 text-ui-xs"
          >
            <Icon name="trash" className="h-4 w-4" />
            Clear history
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className="glass p-6 text-center">
          <span className="inline-flex items-center gap-2 text-ui-sm muted">
            <Spinner className="h-4 w-4" /> Loading
          </span>
        </div>
      ) : entries.length === 0 ? (
        <div className="glass p-8 text-center">
          <h2 className="display text-xl">Nothing studied yet</h2>
          <p className="mx-auto mt-2 max-w-md text-ui-base muted">
            Passages you open will appear here so you can pick a thread back up.
          </p>
          <Link to="/" className="btn btn-primary mt-5">
            Search for a verse
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={`${entry.reference}-${entry.viewedAt}`}>
              <Link
                to={pathFor(entry.reference)}
                state={{ source: 'history', resetTrail: true }}
                className="glass flex items-center gap-4 p-4 transition hover:border-white/30"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[rgb(var(--gold))]">
                  <Icon name="clock" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-[1.0625rem]">{entry.reference}</span>
                  <span className="mt-0.5 block text-ui-xs muted">
                    {entry.translation}
                    {entry.source ? ` · ${SOURCE_LABEL[entry.source] ?? entry.source}` : ''}
                    {' · '}
                    {new Date(entry.viewedAt).toLocaleString()}
                  </span>
                </span>
                <Icon name="chevron-right" className="h-4 w-4 shrink-0 muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pathFor(reference: string): string {
  const parsed = parseReference(reference);
  return parsed ? referenceToPath(parsed) : '/';
}
