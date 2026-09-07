import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AudioButton } from '../components/scripture/AudioButton';
import { Icon } from '../components/ui/Icon';
import { LoadingLines } from '../components/ui/Spinner';
import { usePreferences } from '../context/PreferencesContext';
import { useChapter } from '../hooks/useScripture';
import { useSpeech } from '../hooks/useSpeech';
import { getBook } from '../lib/bible/books';

/**
 * Read a full chapter, then choose a verse to understand.
 *
 * Every verse number is a link into the study for that verse — the shortest
 * path from reading to understanding.
 */
export default function ChapterPage() {
  const { bookId, chapter } = useParams();
  const { translation } = usePreferences();
  const chapterNumber = Number(chapter);
  const book = bookId ? getBook(bookId) : undefined;
  const { data, loading, error } = useChapter(bookId, chapterNumber, translation);
  const { speak, speakingId, supported } = useSpeech();

  useEffect(() => {
    if (book) document.title = `${book.name} ${chapterNumber} — Bible Verses Understood`;
    return () => {
      document.title = 'Bible Verses Understood — Understand the Word. Apply it to your life.';
    };
  }, [book, chapterNumber]);

  const neighbours = useMemo(() => {
    if (!book) return { previous: null, next: null };
    return {
      previous: chapterNumber > 1 ? chapterNumber - 1 : null,
      next: chapterNumber < book.chapters ? chapterNumber + 1 : null,
    };
  }, [book, chapterNumber]);

  if (!book || !Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > book.chapters) {
    return (
      <div className="container-page py-10">
        <div className="glass mx-auto max-w-lg p-6">
          <h1 className="display text-2xl">That chapter does not exist</h1>
          <p className="mt-3 text-ui-base muted">
            {book ? `${book.name} has ${book.chapters} chapters.` : 'We could not find that book.'}
          </p>
          <Link to="/bible" className="btn btn-primary mt-5">
            Browse the Bible
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page space-y-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/bible" className="glass-pill transition hover:border-white/45">
          <Icon name="arrow-left" className="h-4 w-4" />
          All books
        </Link>
      </div>

      <article className="glass-light overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(12_27_46/0.1)] px-5 py-4 sm:px-6">
          <div>
            <h1 className="display text-[1.5rem] leading-tight text-[rgb(var(--ink-on-light))] sm:text-[1.85rem]">
              {book.name} {chapterNumber}
            </h1>
            <p className="mt-0.5 text-ui-xs font-medium muted-on-light">
              {data?.translationName ?? translation}
            </p>
          </div>
          {supported && data ? (
            <AudioButton
              active={speakingId === 'chapter'}
              onToggle={() =>
                speak(
                  'chapter',
                  `${book.name}, chapter ${chapterNumber}. ${data.verses.map((v) => v.text).join(' ')}`,
                  'scripture',
                )
              }
              label="Listen to the chapter"
            />
          ) : null}
        </header>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {loading && !data ? (
            <LoadingLines lines={8} label="Loading the chapter" />
          ) : error ? (
            <p className="text-ui-base muted-on-light">{error}</p>
          ) : (
            <ol className="space-y-3">
              {data?.verses.map((verse) => (
                <li key={verse.verse} className="group flex gap-3">
                  <Link
                    to={`/verse/${book.id}/${chapterNumber}/${verse.verse}`}
                    state={{ source: 'browse', resetTrail: true }}
                    className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[rgb(12_27_46/0.14)] text-ui-xs font-semibold text-[rgb(var(--gold-deep))] transition hover:border-[rgb(var(--gold-deep))] hover:bg-[rgb(var(--gold-deep))]/10"
                    aria-label={`Understand ${book.name} ${chapterNumber}:${verse.verse}`}
                  >
                    {verse.verse}
                  </Link>
                  <p className="scripture flex-1">
                    {verse.text}{' '}
                    <Link
                      to={`/verse/${book.id}/${chapterNumber}/${verse.verse}`}
                      state={{ source: 'browse', resetTrail: true }}
                      className="ref-link ref-link-on-light whitespace-nowrap text-ui-xs font-sans opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                    >
                      Understand This Verse →
                    </Link>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {data?.copyright ? (
          <p className="border-t border-[rgb(12_27_46/0.1)] px-5 py-3 text-ui-xs muted-on-light sm:px-6">
            {data.copyright}
          </p>
        ) : null}
      </article>

      <nav className="flex items-center justify-between gap-3" aria-label="Chapter navigation">
        {neighbours.previous ? (
          <Link to={`/bible/${book.id}/${neighbours.previous}`} className="btn btn-secondary">
            <Icon name="chevron-left" className="h-4 w-4" />
            {book.name} {neighbours.previous}
          </Link>
        ) : (
          <span />
        )}
        {neighbours.next ? (
          <Link to={`/bible/${book.id}/${neighbours.next}`} className="btn btn-secondary ml-auto">
            {book.name} {neighbours.next}
            <Icon name="chevron-right" className="h-4 w-4" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
