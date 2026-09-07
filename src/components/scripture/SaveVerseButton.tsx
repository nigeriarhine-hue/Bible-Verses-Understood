import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { trackEvent } from '../../lib/analytics';
import type { Passage } from '../../lib/bible/types';
import {
  addVerseToCollection,
  collectionsForVerse,
  createCollection,
  listCollections,
  listSavedVerses,
  removeSavedVerse,
  removeVerseFromCollection,
  saveVerse,
  SUGGESTED_COLLECTIONS,
  type CollectionWithCount,
} from '../../lib/library';
import { stashReturnPath } from '../../lib/storage';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

/**
 * Save, for readers with an account — and a clear, unpushy explanation for
 * those without one. Reading and studying never require signing in; keeping a
 * verse across devices does.
 */
export function SaveVerseButton({ passage, tone = 'light' }: { passage: Passage; tone?: 'light' | 'dark' }) {
  const { user, accountsAvailable } = useAuth();
  const { notify } = useToast();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const referenceKey = `${passage.reference.reference}|${passage.translation}`;

  useEffect(() => {
    if (!user) {
      setSavedId(null);
      return;
    }
    let active = true;
    listSavedVerses(user.id)
      .then((verses) => {
        if (!active) return;
        const match = verses.find(
          (verse) =>
            verse.reference === passage.reference.reference && verse.translation === passage.translation,
        );
        setSavedId(match?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, referenceKey, passage.reference.reference, passage.translation]);

  const onClick = async () => {
    if (!user) {
      stashReturnPath(window.location.pathname);
      setPromptOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (savedId) {
        await removeSavedVerse(user.id, savedId);
        setSavedId(null);
        notify(`${passage.reference.reference} removed from your saved verses.`);
      } else {
        const saved = await saveVerse(user.id, passage.reference, passage.translation, passage.text);
        setSavedId(saved.id);
        trackEvent('verse_saved', {
          reference: passage.reference.reference,
          translation: passage.translation,
        });
        notify(`${passage.reference.reference} saved.`, 'success');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const buttonClass = tone === 'light' ? 'btn btn-on-light min-h-0 px-3.5 py-2' : 'btn btn-secondary min-h-0 px-3.5 py-2';

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onClick()}
          disabled={busy}
          className={`${buttonClass} text-ui-xs`}
          aria-pressed={savedId !== null}
        >
          {busy ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Icon name={savedId ? 'bookmark-filled' : 'bookmark'} className="h-4 w-4" />
          )}
          {savedId ? 'Saved' : 'Save'}
        </button>

        {savedId && user ? (
          <button
            type="button"
            onClick={() => setCollectionsOpen(true)}
            className={`${buttonClass} text-ui-xs`}
          >
            <Icon name="layers" className="h-4 w-4" />
            Collections
          </button>
        ) : null}
      </div>

      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Keep this verse"
        description={`A free account keeps ${passage.reference.reference} — and everything else you save — with you across devices.`}
        footer={
          accountsAvailable ? (
            <>
              <Link to="/sign-in" className="btn btn-primary flex-1" data-autofocus>
                Create a free account
              </Link>
              <Link to="/sign-in?mode=signin" className="btn btn-secondary flex-1">
                I already have one
              </Link>
            </>
          ) : (
            <button type="button" className="btn btn-secondary w-full" onClick={() => setPromptOpen(false)}>
              Close
            </button>
          )
        }
      >
        {accountsAvailable ? (
          <ul className="space-y-2.5 text-ui-sm">
            {[
              'Save verses and studies to come back to.',
              'Group them into collections that make sense to you.',
              'Keep your study history and pick up where you left off.',
              'Everything else on this site stays free and open without an account.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--gold))]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui-sm">
            Accounts are not set up for this deployment yet, so saving is unavailable. Everything
            else — reading, studying, following Related Scripture — works as normal.
          </p>
        )}
      </Modal>

      {savedId && user ? (
        <CollectionsModal
          open={collectionsOpen}
          onClose={() => setCollectionsOpen(false)}
          userId={user.id}
          savedVerseId={savedId}
          reference={passage.reference.reference}
        />
      ) : null}
    </>
  );
}

function CollectionsModal({
  open,
  onClose,
  userId,
  savedVerseId,
  reference,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  savedVerseId: string;
  reference: string;
}) {
  const { notify } = useToast();
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([listCollections(userId), collectionsForVerse(savedVerseId)])
      .then(([list, ids]) => {
        setCollections(list);
        setMemberships(new Set(ids));
      })
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : 'Collections could not be loaded.', 'error'),
      )
      .finally(() => setLoading(false));
  }, [open, userId, savedVerseId, notify]);

  const toggle = async (collectionId: string) => {
    const isMember = memberships.has(collectionId);
    try {
      if (isMember) {
        await removeVerseFromCollection(collectionId, savedVerseId);
        setMemberships((current) => {
          const next = new Set(current);
          next.delete(collectionId);
          return next;
        });
      } else {
        await addVerseToCollection(collectionId, savedVerseId);
        setMemberships((current) => new Set(current).add(collectionId));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That could not be changed.', 'error');
    }
  };

  const create = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const collection = await createCollection(userId, trimmed);
      setCollections((current) => [...current, { ...collection, verse_count: 0 }]);
      setNewName('');
      trackEvent('collection_created', { name: trimmed });
      await toggle(collection.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That collection could not be created.', 'error');
    }
  };

  const existingNames = new Set(collections.map((c) => c.name.toLowerCase()));
  const suggestions = SUGGESTED_COLLECTIONS.filter((name) => !existingNames.has(name.toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to a collection"
      description={`Choose where ${reference} belongs. A verse can be in as many collections as you like.`}
    >
      {loading ? (
        <p className="inline-flex items-center gap-2 text-ui-sm muted">
          <Spinner className="h-4 w-4" /> Loading your collections…
        </p>
      ) : (
        <>
          {collections.length > 0 ? (
            <ul className="space-y-1.5">
              {collections.map((collection) => {
                const member = memberships.has(collection.id);
                return (
                  <li key={collection.id}>
                    <button
                      type="button"
                      onClick={() => void toggle(collection.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                        member
                          ? 'border-[rgb(var(--gold))]/60 bg-[rgb(var(--gold))]/12'
                          : 'border-white/12 hover:bg-white/10'
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                          member ? 'border-[rgb(var(--gold))] bg-[rgb(var(--gold))] text-[#241701]' : 'border-white/30'
                        }`}
                      >
                        {member ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="flex-1 text-ui-sm font-medium">{collection.name}</span>
                      <span className="text-ui-xs muted">{collection.verse_count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ui-sm muted">
              You have no collections yet. Create one below — or start from a suggestion.
            </p>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create(newName);
            }}
          >
            <label htmlFor="new-collection" className="sr-only">
              New collection name
            </label>
            <input
              id="new-collection"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New collection…"
              className="field flex-1"
              maxLength={60}
            />
            <button type="submit" className="btn btn-primary px-4" disabled={!newName.trim()}>
              <Icon name="plus" className="h-4 w-4" />
              <span className="sr-only">Create collection</span>
            </button>
          </form>

          {suggestions.length > 0 ? (
            <div className="mt-4">
              <p className="text-ui-xs font-semibold uppercase tracking-wider muted">Suggestions</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {suggestions.slice(0, 6).map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => void create(name)}
                      className="btn btn-secondary min-h-0 px-3 py-1.5 text-ui-xs"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5" />
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
