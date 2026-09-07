import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { SignedOutPrompt } from '../components/ui/SignedOutPrompt';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseReference, referenceToPath } from '../lib/bible/reference';
import {
  listCollections,
  listCollectionVerses,
  removeVerseFromCollection,
  type Collection,
  type SavedVerse,
} from '../lib/library';

export default function CollectionPage() {
  const { id } = useParams();
  const { user, loading: authLoading, accountsAvailable } = useAuth();
  const { notify } = useToast();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [verses, setVerses] = useState<SavedVerse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    setLoading(true);
    Promise.all([listCollections(user.id), listCollectionVerses(id)])
      .then(([collections, items]) => {
        if (!active) return;
        setCollection(collections.find((entry) => entry.id === id) ?? null);
        setVerses(items);
      })
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : 'That collection could not be loaded.', 'error'),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, id, notify]);

  if (authLoading) {
    return (
      <div className="container-page py-20 text-center">
        <span className="glass-pill">
          <Spinner className="h-4 w-4" /> Loading
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <SignedOutPrompt
        title="Collections need an account"
        body="Sign in to open your collections. Reading and studying Scripture works without one."
        accountsAvailable={accountsAvailable}
      />
    );
  }

  return (
    <div className="container-page space-y-4 pb-6">
      <Link to="/saved" className="glass-pill transition hover:border-white/45">
        <Icon name="arrow-left" className="h-4 w-4" />
        Saved
      </Link>

      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">
          {collection?.name ?? 'Collection'}
        </h1>
        {collection?.description ? (
          <p className="mt-2 text-ui-base muted">{collection.description}</p>
        ) : null}
        <p className="mt-2 text-ui-sm muted">
          {verses.length} {verses.length === 1 ? 'verse' : 'verses'}
        </p>
      </header>

      {loading ? (
        <div className="glass p-6 text-center">
          <span className="inline-flex items-center gap-2 text-ui-sm muted">
            <Spinner className="h-4 w-4" /> Loading
          </span>
        </div>
      ) : verses.length === 0 ? (
        <div className="glass p-8 text-center">
          <h2 className="display text-xl">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-ui-base muted">
            Save a verse, then use Collections on the study page to add it here.
          </p>
          <Link to="/bible" className="btn btn-primary mt-5">
            Browse the Bible
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {verses.map((verse) => (
            <li key={verse.id} className="glass flex flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to={pathFor(verse.reference)}
                  state={{ source: 'saved', resetTrail: true }}
                  className="display text-[1.0625rem] text-[rgb(var(--gold))] hover:underline"
                >
                  {verse.reference}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    if (!id) return;
                    await removeVerseFromCollection(id, verse.id);
                    setVerses((current) => current.filter((item) => item.id !== verse.id));
                    notify('Removed from this collection.');
                  }}
                  className="-m-1 rounded-lg p-1 muted transition hover:text-[#ffb4a8]"
                >
                  <Icon name="close" className="h-4 w-4" />
                  <span className="sr-only">Remove {verse.reference} from this collection</span>
                </button>
              </div>
              {verse.verse_text ? (
                <p className="glass-light rounded-xl px-3.5 py-3 font-serif text-[0.97rem] leading-[1.65rem] text-[rgb(var(--ink-on-light))]">
                  “{verse.verse_text.length > 200 ? `${verse.verse_text.slice(0, 198)}…` : verse.verse_text}”
                </p>
              ) : null}
              <p className="text-ui-xs muted">{verse.translation}</p>
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
