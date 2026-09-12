import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AudioButton } from '../components/scripture/AudioButton';
import { SaveVerseButton } from '../components/scripture/SaveVerseButton';
import { ScriptureCard } from '../components/scripture/ScriptureCard';
import { ShareButton } from '../components/scripture/ShareButton';
import { BackToPrevious } from '../components/study/BackToPrevious';
import { StudyTrail } from '../components/study/StudyTrail';
import { StudyView } from '../components/study/StudyView';
import { Icon } from '../components/ui/Icon';
import { LoadingLines, Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useToast } from '../context/ToastContext';
import { useTrail } from '../context/TrailContext';
import { usePassage } from '../hooks/useScripture';
import { useSpeech } from '../hooks/useSpeech';
import { useStudyHistory } from '../hooks/useStudyHistory';
import { CommentaryError, getCachedStudy, getStudy } from '../lib/ai/client';
import { EXPLANATION_MODE, EXPLANATION_MODE_LABEL, type Study } from '../lib/ai/types';
import { getBook } from '../lib/bible/books';
import { pathToReference, referenceToPath } from '../lib/bible/reference';
import { trackEvent } from '../lib/analytics';
import { recordNavigation, saveStudy } from '../lib/library';
import type { StudySource } from '../types/database';

/**
 * The study page: Scripture, then the explanation, then where to go next.
 *
 * Switching translation keeps the reader exactly here — same passage, same
 * trail. There is one explanation, so there is nothing to choose between.
 */
export default function VersePage() {
  const { bookId, chapter, verse } = useParams();
  const location = useLocation();
  const { translation } = usePreferences();
  const { user } = useAuth();
  const { notify } = useToast();
  const { trail, previous, visit } = useTrail();
  const { record } = useStudyHistory();
  const { speak, speakingId, supported: audioSupported } = useSpeech();

  const reference = useMemo(
    () => (bookId && chapter ? pathToReference(bookId, chapter, verse) : null),
    [bookId, chapter, verse],
  );

  const { data: passage, loading: passageLoading, error: passageError } = usePassage(reference, translation);

  const [study, setStudy] = useState<Study | null>(null);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<{ message: string; code: string } | null>(null);
  const [savingStudy, setSavingStudy] = useState(false);

  const navigationState = location.state as
    | { source?: StudySource; resetTrail?: boolean; from?: string }
    | null;

  /* --------------------------------------------------------------------- */
  /* Trail and history                                                     */
  /* --------------------------------------------------------------------- */
  useEffect(() => {
    if (!passage) return;
    const step = {
      reference: passage.reference.reference,
      path: referenceToPath(passage.reference),
      translation: passage.translation,
    };
    const cameFrom = visit(step, { reset: navigationState?.resetTrail });

    trackEvent('verse_view', {
      reference: passage.reference.reference,
      translation: passage.translation,
      source: navigationState?.source ?? 'search',
    });

    record({
      reference: passage.reference.reference,
      translation: passage.translation,
      mode: EXPLANATION_MODE,
      source: navigationState?.source ?? 'search',
    });

    if (user) {
      void recordNavigation({
        userId: user.id,
        fromReference: cameFrom?.reference ?? navigationState?.from ?? null,
        toReference: passage.reference.reference,
        translation: passage.translation,
      });
    }
    // Only re-run when the passage actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage?.reference.reference, passage?.translation]);

  useEffect(() => {
    if (passage) document.title = `${passage.reference.reference} — Bible Verses Understood`;
    return () => {
      document.title = 'Bible Verses Understood — Understand the Word. Apply it to your life.';
    };
  }, [passage]);

  /* --------------------------------------------------------------------- */
  /* Commentary                                                            */
  /* --------------------------------------------------------------------- */
  const loadStudy = useCallback(
    async () => {
      if (!passage) return;
      const cached = getCachedStudy(passage.reference.reference, passage.translation);
      if (cached) {
        setStudy(cached);
        setStudyError(null);
        return;
      }
      setStudyLoading(true);
      setStudyError(null);
      try {
        const result = await getStudy(
          passage.reference.reference,
          passage.translation,
          passage.text,
        );
        setStudy(result);
      } catch (error) {
        setStudy(null);
        setStudyError({
          message:
            error instanceof CommentaryError
              ? error.message
              : 'The explanation could not be loaded. Please try again.',
          code: error instanceof CommentaryError ? error.code : 'failed',
        });
      } finally {
        setStudyLoading(false);
      }
    },
    [passage],
  );

  useEffect(() => {
    setStudy(null);
    if (passage) void loadStudy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage?.reference.reference, passage?.translation]);

  const onSaveStudy = async () => {
    if (!study) return;
    if (!user) {
      notify('Create a free account to save studies to your library.', 'info');
      return;
    }
    setSavingStudy(true);
    try {
      await saveStudy(user.id, study);
      notify(`Your study of ${study.reference} is saved.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That study could not be saved.', 'error');
    } finally {
      setSavingStudy(false);
    }
  };

  /* --------------------------------------------------------------------- */
  /* Render                                                                */
  /* --------------------------------------------------------------------- */
  if (!reference) {
    return <UnknownReference bookId={bookId} chapter={chapter} />;
  }

  const book = getBook(reference.bookId);

  return (
    <div className="container-page space-y-4 pb-6">
      {/* Back control and trail sit above everything, on their own surfaces. */}
      <div className="flex flex-wrap items-center gap-2">
        <BackToPrevious step={previous} />
        {book ? (
          <Link
            to={`/bible/${book.id}/${reference.chapter}`}
            className="glass-pill transition hover:border-white/45"
          >
            <Icon name="book" className="h-4 w-4" />
            Read {book.name} {reference.chapter}
          </Link>
        ) : null}
      </div>

      <StudyTrail trail={trail} />

      {/* ---------------------------------------------------------------- */}
      {/* Scripture                                                         */}
      {/* ---------------------------------------------------------------- */}
      {passageLoading && !passage ? (
        <div className="glass-light p-6">
          <LoadingLines lines={3} label="Loading Scripture" />
        </div>
      ) : passageError ? (
        <div className="glass p-6">
          <h1 className="display text-xl">That passage could not be opened</h1>
          <p className="mt-2 text-ui-base muted">{passageError}</p>
          <Link to="/bible" className="btn btn-primary mt-4">
            Browse the Bible
          </Link>
        </div>
      ) : passage ? (
        <>
          <ScriptureCard
            passage={passage}
            actions={
              <>
                {audioSupported ? (
                  <AudioButton
                    active={speakingId === 'scripture'}
                    onToggle={() =>
                      speak('scripture', `${passage.reference.reference}. ${passage.text}`, 'scripture')
                    }
                  />
                ) : null}
                <SaveVerseButton passage={passage} />
                <ShareButton passage={passage} />
              </>
            }
          />

          {/* -------------------------------------------------------------- */}
          {/* Explanation                                                     */}
          {/* -------------------------------------------------------------- */}
          {studyLoading ? (
            <div className="glass p-5 sm:p-6">
              <h2 className="display text-[1.375rem] leading-tight sm:text-[1.5rem]">
                {EXPLANATION_MODE_LABEL}
              </h2>
              <p className="mt-2 inline-flex items-center gap-2 text-ui-sm muted">
                <Spinner className="h-4 w-4" />
                Preparing the explanation of {passage.reference.reference}…
              </p>
              <div className="mt-4">
                <LoadingLines lines={5} />
              </div>
            </div>
          ) : studyError ? (
            <CommentaryUnavailable
              message={studyError.message}
              code={studyError.code}
              onRetry={() => void loadStudy()}
            />
          ) : study ? (
            <>
              <div className="glass p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="display text-[1.375rem] leading-tight sm:text-[1.5rem]">
                      {EXPLANATION_MODE_LABEL}
                    </h2>
                    <p className="mt-1.5 text-ui-xs leading-relaxed muted">
                      Commentary written for {study.reference} in the {study.translation}. The
                      Scripture above is unchanged.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onSaveStudy()}
                    className="btn btn-secondary min-h-0 shrink-0 px-3.5 py-2 text-ui-xs"
                    disabled={savingStudy}
                  >
                    {savingStudy ? <Spinner className="h-4 w-4" /> : <Icon name="bookmark" className="h-4 w-4" />}
                    Save this study
                  </button>
                </div>
              </div>

              <StudyView
                study={study}
                translation={passage.translation}
                audioSupported={audioSupported}
                audioActive={speakingId === 'study'}
                onAudio={() =>
                  speak(
                    'study',
                    [study.summary, ...study.sections.map((s) => `${s.heading}. ${s.body}`)].join('\n\n'),
                    'explanation',
                  )
                }
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CommentaryUnavailable({
  message,
  code,
  onRetry,
}: {
  message: string;
  code: string;
  onRetry: () => void;
}) {
  const notConfigured = code === 'not_configured';
  const dailyLimit = code === 'daily_limit';
  // Neither of these is fixed by trying again: one is a deployment that has no
  // commentary service, the other is today's allowance already spent.
  const retryable = !notConfigured && !dailyLimit;
  return (
    <div className="glass p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold))]" />
        <div>
          <h2 className="display text-[1.25rem] leading-tight">
            {notConfigured
              ? 'Explanations are not switched on yet'
              : dailyLimit
                ? "Today's explanation limit has been reached"
                : 'The explanation did not load'}
          </h2>
          <p className="mt-2 text-prose-base">{message}</p>
          <p className="mt-2 text-ui-sm muted">
            The Scripture above is unaffected — it comes from the Bible text itself, not from the
            commentary service.
          </p>
          {retryable ? (
            <button type="button" onClick={onRetry} className="btn btn-primary mt-4">
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UnknownReference({ bookId, chapter }: { bookId?: string; chapter?: string }) {
  const book = bookId ? getBook(bookId) : undefined;
  return (
    <div className="container-page py-10">
      <div className="glass mx-auto max-w-lg p-6">
        <h1 className="display text-2xl">That reference does not exist</h1>
        <p className="mt-3 text-ui-base muted">
          {book
            ? `${book.name} has ${book.chapters} chapters, so there is no chapter ${chapter}.`
            : 'We could not find that book of the Bible.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/bible" className="btn btn-primary">
            Browse the Bible
          </Link>
          <Link to="/" className="btn btn-secondary">
            Search again
          </Link>
        </div>
      </div>
    </div>
  );
}
