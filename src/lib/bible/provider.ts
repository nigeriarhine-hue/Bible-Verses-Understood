import { cachedFetch, DAY, HOUR } from '../cache';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../env';
import { getBook } from './books';
import { formatReference } from './reference';
import {
  DEFAULT_TRANSLATION,
  TRANSLATION_CATALOGUE,
  findTranslation,
  isLocalTranslation,
  sortTranslations,
} from './translations';
import type { BibleReference, ChapterContent, Passage, TranslationInfo, Verse } from './types';

/**
 * Scripture retrieval.
 *
 * Rule of the product: Scripture text always comes from a Bible source — the
 * bundled public-domain texts, or an authorised provider proxied through an
 * Edge Function. Generated commentary never supplies Bible text.
 */

interface LocalBookFile {
  id: string;
  name: string;
  translation: string;
  chapters: string[][];
}

export class ScriptureError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'unavailable_translation' | 'network' | 'invalid_reference',
  ) {
    super(message);
    this.name = 'ScriptureError';
  }
}

/* -------------------------------------------------------------------------- */
/* Local (bundled public-domain) provider                                     */
/* -------------------------------------------------------------------------- */

async function loadLocalBook(translation: string, bookId: string): Promise<LocalBookFile> {
  return cachedFetch(`bvu:book:${translation}:${bookId}`, DAY * 30, async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}scripture/${translation}/${bookId}.json`);
    if (!res.ok) {
      throw new ScriptureError(`Could not load ${bookId} (${translation}).`, 'not_found');
    }
    return (await res.json()) as LocalBookFile;
  });
}

function versesFromLocal(book: LocalBookFile, ref: BibleReference): Verse[] {
  const verses: Verse[] = [];
  const lastChapter = ref.endChapter && ref.endChapter > ref.chapter ? ref.endChapter : ref.chapter;

  for (let chapter = ref.chapter; chapter <= lastChapter; chapter += 1) {
    const texts = book.chapters[chapter - 1];
    if (!texts) break;
    const isFirst = chapter === ref.chapter;
    const isLast = chapter === lastChapter;
    const from = isFirst && ref.startVerse ? ref.startVerse : 1;
    const to = isLast && ref.endVerse ? ref.endVerse : isFirst && ref.startVerse && !ref.endVerse ? ref.startVerse : texts.length;
    for (let verse = from; verse <= Math.min(to, texts.length); verse += 1) {
      const text = texts[verse - 1];
      if (text) verses.push({ chapter, verse, text });
    }
  }
  return verses;
}

/* -------------------------------------------------------------------------- */
/* Remote provider (proxied — provider keys never reach the browser)          */
/* -------------------------------------------------------------------------- */

async function callScriptureFunction<T>(payload: Record<string, unknown>): Promise<T> {
  if (!FUNCTIONS_URL) {
    throw new ScriptureError('No Scripture provider is configured for this translation.', 'unavailable_translation');
  }
  const res = await fetch(`${FUNCTIONS_URL}/scripture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ScriptureError(
      detail || `Scripture provider returned ${res.status}.`,
      res.status === 404 ? 'not_found' : 'network',
    );
  }
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Resolves the translation to use, falling back to the default if unavailable. */
function resolveTranslation(translation: string | undefined, available: string[]): string {
  const wanted = (translation || DEFAULT_TRANSLATION).toUpperCase();
  if (available.includes(wanted)) return wanted;
  return DEFAULT_TRANSLATION;
}

let availabilityPromise: Promise<TranslationInfo[]> | null = null;

/**
 * The translations a reader can actually open right now.
 *
 * Starts from the bundled public-domain texts, then asks the Edge Function
 * which additional translations the configured provider keys are authorised to
 * serve. If nothing is configured, the bundled list is the answer.
 */
export function getAvailableTranslations(): Promise<TranslationInfo[]> {
  if (!availabilityPromise) {
    availabilityPromise = (async () => {
      const base = TRANSLATION_CATALOGUE.map((t) => ({ ...t }));
      if (!FUNCTIONS_URL) return sortTranslations(base);
      try {
        const remote = await cachedFetch<TranslationInfo[]>('bvu:translations', HOUR * 6, () =>
          callScriptureFunction<{ translations: TranslationInfo[] }>({ action: 'translations' }).then(
            (r) => r.translations ?? [],
          ),
        );
        for (const entry of remote) {
          const match = base.find(
            (t) => t.abbreviation.toUpperCase() === entry.abbreviation.toUpperCase(),
          );
          if (match) {
            match.isAvailable = entry.isAvailable;
            match.provider = entry.provider ?? match.provider;
            match.providerTranslationId = entry.providerTranslationId ?? match.providerTranslationId;
            if (entry.copyrightNotice) match.copyrightNotice = entry.copyrightNotice;
          } else if (entry.isAvailable) {
            base.push({ ...entry, sortOrder: entry.sortOrder || 900 });
          }
        }
      } catch {
        // Provider unreachable — the bundled translations still work.
      }
      return sortTranslations(base);
    })();
  }
  return availabilityPromise;
}

/** Synchronous best-effort list for first paint. */
export function getBundledTranslations(): TranslationInfo[] {
  return sortTranslations(TRANSLATION_CATALOGUE.filter((t) => t.isAvailable));
}

/** Fetches the Scripture text for a reference. Never returns generated text. */
export async function getPassage(ref: BibleReference, translation: string): Promise<Passage> {
  const book = getBook(ref.bookId);
  if (!book) throw new ScriptureError(`Unknown book: ${ref.bookId}`, 'invalid_reference');
  if (ref.chapter < 1 || ref.chapter > book.chapters) {
    throw new ScriptureError(`${book.name} has ${book.chapters} chapters.`, 'invalid_reference');
  }

  const available = (await getAvailableTranslations()).filter((t) => t.isAvailable).map((t) => t.abbreviation);
  const code = resolveTranslation(translation, available);
  const info = findTranslation(code);

  if (isLocalTranslation(code)) {
    const file = await loadLocalBook(code, ref.bookId);
    const verses = versesFromLocal(file, ref);
    if (verses.length === 0) {
      throw new ScriptureError(`${formatReference(ref)} is not a verse in ${book.name}.`, 'not_found');
    }
    return {
      reference: normaliseToFetched(ref, verses),
      translation: code,
      translationName: info?.name ?? code,
      verses,
      text: verses.map((v) => v.text).join(' '),
      copyright: info?.copyrightNotice ?? undefined,
      source: 'local',
    };
  }

  const cacheKey = `bvu:passage:${code}:${ref.bookId}:${ref.chapter}:${ref.startVerse ?? 'all'}:${ref.endVerse ?? ''}:${ref.endChapter ?? ''}`;
  return cachedFetch(cacheKey, DAY, async () => {
    const result = await callScriptureFunction<{ verses: Verse[]; copyright?: string; source: Passage['source'] }>({
      action: 'passage',
      translation: code,
      bookId: ref.bookId,
      chapter: ref.chapter,
      startVerse: ref.startVerse,
      endVerse: ref.endVerse,
      endChapter: ref.endChapter,
    });
    if (!result.verses?.length) {
      throw new ScriptureError(`${formatReference(ref)} was not returned by the provider.`, 'not_found');
    }
    return {
      reference: normaliseToFetched(ref, result.verses),
      translation: code,
      translationName: info?.name ?? code,
      verses: result.verses,
      text: result.verses.map((v) => v.text).join(' '),
      copyright: result.copyright ?? info?.copyrightNotice ?? undefined,
      source: result.source ?? 'api.bible',
    };
  });
}

/** Reads a whole chapter, for the Bible browser. */
export async function getChapter(
  bookId: string,
  chapter: number,
  translation: string,
): Promise<ChapterContent> {
  const book = getBook(bookId);
  if (!book) throw new ScriptureError(`Unknown book: ${bookId}`, 'invalid_reference');
  if (chapter < 1 || chapter > book.chapters) {
    throw new ScriptureError(`${book.name} has ${book.chapters} chapters.`, 'invalid_reference');
  }
  const ref: BibleReference = {
    bookId,
    book: book.name,
    chapter,
    startVerse: null,
    endVerse: null,
    endChapter: null,
    reference: `${book.name} ${chapter}`,
  };
  const passage = await getPassage(ref, translation);
  return {
    reference: ref,
    translation: passage.translation,
    translationName: passage.translationName,
    verses: passage.verses,
    copyright: passage.copyright,
  };
}

/** Number of verses in a chapter, used to validate and to build the browser. */
export async function getVerseCount(
  bookId: string,
  chapter: number,
  translation = DEFAULT_TRANSLATION,
): Promise<number> {
  const code = isLocalTranslation(translation) ? translation : DEFAULT_TRANSLATION;
  const file = await loadLocalBook(code, bookId);
  return file.chapters[chapter - 1]?.length ?? 0;
}

/**
 * Confirms a reference exists in the canon *and* has text, then returns the
 * reference narrowed to what actually came back. Used to validate every
 * generated Related Scripture suggestion before it is rendered.
 */
export async function validateReference(
  ref: BibleReference,
  translation: string,
): Promise<{ ok: true; passage: Passage } | { ok: false; reason: string }> {
  try {
    const passage = await getPassage(ref, translation);
    return { ok: true, passage };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Tightens a requested reference to the verses actually returned. */
function normaliseToFetched(ref: BibleReference, verses: Verse[]): BibleReference {
  if (ref.startVerse === null) return ref;
  const first = verses[0];
  const last = verses[verses.length - 1];
  if (!first || !last) return ref;
  const next: BibleReference = {
    ...ref,
    chapter: first.chapter,
    startVerse: first.verse,
    endVerse: last.verse === first.verse && last.chapter === first.chapter ? null : last.verse,
    endChapter: last.chapter !== first.chapter ? last.chapter : null,
    reference: '',
  };
  return { ...next, reference: formatReference(next) };
}
