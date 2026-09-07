import { useEffect, useState } from 'react';
import { getChapter, getPassage, ScriptureError } from '../lib/bible/provider';
import type { BibleReference, ChapterContent, Passage } from '../lib/bible/types';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Retrieves the Scripture for a reference in the reader's translation. */
export function usePassage(
  reference: BibleReference | null,
  translation: string,
): AsyncState<Passage> {
  const [state, setState] = useState<AsyncState<Passage>>({
    data: null,
    loading: Boolean(reference),
    error: null,
  });

  const key = reference ? `${reference.reference}|${translation}` : null;

  useEffect(() => {
    if (!reference) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let active = true;
    setState((current) => ({ data: current.data, loading: true, error: null }));

    getPassage(reference, translation)
      .then((passage) => {
        if (active) setState({ data: passage, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error:
            error instanceof ScriptureError
              ? error.message
              : 'That passage could not be loaded. Please try again.',
        });
      });

    return () => {
      active = false;
    };
    // `key` captures everything that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** Retrieves a whole chapter, for the Bible browser. */
export function useChapter(
  bookId: string | undefined,
  chapter: number,
  translation: string,
): AsyncState<ChapterContent> {
  const [state, setState] = useState<AsyncState<ChapterContent>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!bookId || !Number.isFinite(chapter)) {
      setState({ data: null, loading: false, error: 'That chapter does not exist.' });
      return;
    }
    let active = true;
    setState((current) => ({ data: current.data, loading: true, error: null }));

    getChapter(bookId, chapter, translation)
      .then((content) => {
        if (active) setState({ data: content, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error:
            error instanceof ScriptureError
              ? error.message
              : 'That chapter could not be loaded. Please try again.',
        });
      });

    return () => {
      active = false;
    };
  }, [bookId, chapter, translation]);

  return state;
}
