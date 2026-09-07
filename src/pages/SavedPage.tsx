import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { trackEvent } from '../lib/analytics';
import { parseReference, referenceToPath } from '../lib/bible/reference';
import {
  createCollection,
  deleteCollection,
  listCollections,
  listSavedStudies,
  listSavedVerses,
  removeSavedStudy,
  removeSavedVerse,
  SUGGESTED_COLLECTIONS,
  type CollectionWithCount,
  type SavedStudy,
  type SavedVerse,
} from '../lib/library';
import { SignedOutPrompt } from '../components/ui/SignedOutPrompt';

type Tab = 'verses' | 'studies' | 'collections';

export default function SavedPage() {
  const { user, loading: authLoading, accountsAvailable } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('verses');
  const [verses, setVerses] = useState<SavedVerse[]>([]);
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [v, s, c] = await Promise.all([
        listSavedVerses(user.id),
        listSavedStudies(user.id),
        listCollections(user.id),
      ]);
      setVerses(v);
      setStudies(s);
      setCollections(c);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Your library could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return (
      <div className="container-page py-20 text-center">
        <span className="glass-pill">
          <Spinner className="h-4 w-4" />
          Loading
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <SignedOutPrompt
        title="Your saved verses live here"
        body="Create a free account to keep verses, studies and collections with you across devices. Reading and studying Scripture never needs an account."
        accountsAvailable={accountsAvailable}
      />
    );
  }

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const collection = await createCollection(user.id, name);
      setCollections((current) => [...current, { ...collection, verse_count: 0 }]);
      trackEvent('collection_created', { name });
      setNewName('');
      setNewOpen(false);
      notify(`“${name}” created.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That could not be created.', 'error');
    }
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'verses', label: 'Verses', count: verses.length },
    { id: 'studies', label: 'Studies', count: studies.length },
    { id: 'collections', label: 'Collections', count: collections.length },
  ];

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">Saved</h1>
        <p className="mt-2 text-ui-base muted">
          Everything you have kept, and the collections you have grouped it into.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/history" className="btn btn-secondary min-h-0 px-3.5 py-2 text-ui-xs">
            <Icon name="clock" className="h-4 w-4" />
            Study history
          </Link>
        </div>
      </header>

      <div className="glass p-1.5">
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Saved content">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={`rounded-xl px-3 py-2.5 text-ui-sm font-semibold transition ${
                tab === entry.id
                  ? 'bg-[rgb(var(--gold))] text-[#241701]'
                  : 'hover:bg-white/10'
              }`}
            >
              {entry.label}
              <span className={`ml-1.5 ${tab === entry.id ? 'text-[#3a2a08]' : 'muted'}`}>
                {entry.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass p-6 text-center">
          <span className="inline-flex items-center gap-2 text-ui-sm muted">
            <Spinner className="h-4 w-4" />
            Loading your library
          </span>
        </div>
      ) : tab === 'verses' ? (
        verses.length === 0 ? (
          <EmptyState
            title="No saved verses yet"
            body="When a verse is worth returning to, use Save on the study page and it will appear here."
            action={{ to: '/bible', label: 'Browse the Bible' }}
          />
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
                      await removeSavedVerse(user.id, verse.id);
                      setVerses((current) => current.filter((item) => item.id !== verse.id));
                      notify('Removed from your saved verses.');
                    }}
                    className="-m-1 rounded-lg p-1 muted transition hover:text-[#ffb4a8]"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                    <span className="sr-only">Remove {verse.reference}</span>
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
        )
      ) : tab === 'studies' ? (
        studies.length === 0 ? (
          <EmptyState
            title="No saved studies yet"
            body="Use “Save this study” under any explanation to keep it, exactly as it was written."
            action={{ to: '/', label: 'Find a verse to study' }}
          />
        ) : (
          <ul className="space-y-3">
            {studies.map((study) => (
              <li key={study.id} className="glass flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    to={pathFor(study.reference)}
                    state={{ source: 'saved', resetTrail: true }}
                    className="display text-[1.0625rem] text-[rgb(var(--gold))] hover:underline"
                  >
                    {study.reference}
                  </Link>
                  <p className="mt-0.5 text-ui-xs muted">
                    {capitalise(study.explanation_mode)} explanation · {study.translation} ·{' '}
                    {new Date(study.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await removeSavedStudy(user.id, study.id);
                    setStudies((current) => current.filter((item) => item.id !== study.id));
                    notify('Study removed.');
                  }}
                  className="-m-1 rounded-lg p-1 muted transition hover:text-[#ffb4a8]"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  <span className="sr-only">Remove this study</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setNewOpen(true)} className="btn btn-primary">
              <Icon name="plus" className="h-4 w-4" />
              New collection
            </button>
          </div>

          {collections.length === 0 ? (
            <EmptyState
              title="No collections yet"
              body="Collections are yours to shape — group verses however makes sense to you. Nothing is created for you."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection) => (
                <li key={collection.id} className="glass flex flex-col gap-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/collections/${collection.id}`}
                      className="display text-[1.0625rem] hover:text-[rgb(var(--gold))]"
                    >
                      {collection.name}
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCollection(user.id, collection.id);
                        setCollections((current) => current.filter((item) => item.id !== collection.id));
                        notify(`“${collection.name}” deleted.`);
                      }}
                      className="-m-1 rounded-lg p-1 muted transition hover:text-[#ffb4a8]"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                      <span className="sr-only">Delete {collection.name}</span>
                    </button>
                  </div>
                  {collection.description ? (
                    <p className="text-ui-sm muted">{collection.description}</p>
                  ) : null}
                  <p className="mt-auto text-ui-xs muted">
                    {collection.verse_count} {collection.verse_count === 1 ? 'verse' : 'verses'}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <Modal
            open={newOpen}
            onClose={() => setNewOpen(false)}
            title="New collection"
            description="Name it whatever helps you find it again."
            footer={
              <button type="button" onClick={() => void onCreate()} className="btn btn-primary flex-1" disabled={!newName.trim()}>
                Create
              </button>
            }
          >
            <label htmlFor="collection-name" className="mb-1.5 block text-ui-sm font-medium">
              Name
            </label>
            <input
              id="collection-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="field"
              maxLength={60}
              data-autofocus
            />
            <p className="mt-4 text-ui-xs font-semibold uppercase tracking-wider muted">Suggestions</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {SUGGESTED_COLLECTIONS.filter(
                (name) => !collections.some((c) => c.name.toLowerCase() === name.toLowerCase()),
              ).map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setNewName(name)}
                    className="btn btn-secondary min-h-0 px-3 py-1.5 text-ui-xs"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </Modal>
        </>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="glass p-8 text-center">
      <h2 className="display text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-ui-base muted">{body}</p>
      {action ? (
        <Link to={action.to} className="btn btn-primary mt-5">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function pathFor(reference: string): string {
  const parsed = parseReference(reference);
  return parsed ? referenceToPath(parsed) : '/';
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
