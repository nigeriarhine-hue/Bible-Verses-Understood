/**
 * POST /functions/v1/scripture
 *
 * Proxy for licensed Bible providers, so provider keys never reach the browser.
 *
 * The app's four bundled public-domain translations are served as static files
 * and never come through here. This function exists so that adding an
 * authorised key (Crossway ESV, API.Bible) unlocks the copyrighted translations
 * the key actually covers — and nothing more.
 *
 * Body:
 *   { action: "translations" }
 *   { action: "passage", translation, bookId, chapter, startVerse, endVerse, endChapter }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { BOOKS } from '../_shared/books.ts';
import { callerKey, isRateLimited } from '../_shared/store.ts';

const ESV_API = 'https://api.esv.org/v3/passage/text/';
const API_BIBLE = 'https://api.scripture.api.bible/v1';

const BY_ID = new Map(BOOKS.map((b) => [b.id, b]));

/** USFM book identifiers used by API.Bible, keyed by our slug. */
const USFM: Record<string, string> = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU',
  joshua: 'JOS', judges: 'JDG', ruth: 'RUT', '1-samuel': '1SA', '2-samuel': '2SA',
  '1-kings': '1KI', '2-kings': '2KI', '1-chronicles': '1CH', '2-chronicles': '2CH',
  ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB', psalms: 'PSA',
  proverbs: 'PRO', ecclesiastes: 'ECC', 'song-of-solomon': 'SNG', isaiah: 'ISA',
  jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN', hosea: 'HOS',
  joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC', nahum: 'NAM',
  habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1-corinthians': '1CO', '2-corinthians': '2CO', galatians: 'GAL', ephesians: 'EPH',
  philippians: 'PHP', colossians: 'COL', '1-thessalonians': '1TH', '2-thessalonians': '2TH',
  '1-timothy': '1TI', '2-timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB',
  james: 'JAS', '1-peter': '1PE', '2-peter': '2PE', '1-john': '1JN', '2-john': '2JN',
  '3-john': '3JN', jude: 'JUD', revelation: 'REV',
};

interface Verse {
  chapter: number;
  verse: number;
  text: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);

  if (isRateLimited(`scripture:${callerKey(req)}`, 120)) {
    return failure(req, 'Too many requests. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  if (body.action === 'translations') {
    return json(req, { translations: await listTranslations() });
  }

  if (body.action !== 'passage') return failure(req, 'Unknown action.');

  const translation = String(body.translation ?? '').trim().toUpperCase();
  const bookId = String(body.bookId ?? '').trim();
  const chapter = Number(body.chapter);
  const startVerse = body.startVerse === null || body.startVerse === undefined ? null : Number(body.startVerse);
  const endVerse = body.endVerse === null || body.endVerse === undefined ? null : Number(body.endVerse);
  const endChapter = body.endChapter === null || body.endChapter === undefined ? null : Number(body.endChapter);

  const book = BY_ID.get(bookId);
  if (!book) return failure(req, `Unknown book: ${bookId}`, 404);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    return failure(req, `${book.name} has ${book.chapters} chapters.`, 404);
  }

  const reference = buildReference(book.name, chapter, startVerse, endVerse, endChapter);

  try {
    if (translation === 'ESV' && Deno.env.get('ESV_API_KEY')) {
      return json(req, await fetchEsv(reference, chapter));
    }
    const apiBibleKey = Deno.env.get('API_BIBLE_KEY');
    if (apiBibleKey) {
      const translationId = await resolveApiBibleId(translation);
      if (translationId) {
        return json(req, await fetchApiBible(translationId, bookId, chapter, startVerse, endVerse, endChapter));
      }
    }
    return failure(
      req,
      `${translation} is not available. No authorised provider is configured for it.`,
      404,
      { code: 'unavailable_translation' },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider request failed.';
    return failure(req, message, 502);
  }
});

function buildReference(
  book: string,
  chapter: number,
  startVerse: number | null,
  endVerse: number | null,
  endChapter: number | null,
): string {
  if (startVerse === null) return `${book} ${chapter}`;
  if (endChapter && endChapter !== chapter && endVerse) {
    return `${book} ${chapter}:${startVerse}-${endChapter}:${endVerse}`;
  }
  if (endVerse && endVerse !== startVerse) return `${book} ${chapter}:${startVerse}-${endVerse}`;
  return `${book} ${chapter}:${startVerse}`;
}

/* -------------------------------------------------------------------------- */
/* Which translations can we actually serve?                                  */
/* -------------------------------------------------------------------------- */

let translationCache: { at: number; value: unknown[] } | null = null;

async function listTranslations(): Promise<unknown[]> {
  if (translationCache && Date.now() - translationCache.at < 60 * 60_000) {
    return translationCache.value;
  }

  const available: unknown[] = [];

  if (Deno.env.get('ESV_API_KEY')) {
    available.push({
      abbreviation: 'ESV',
      name: 'English Standard Version',
      language: 'English',
      provider: 'esv',
      providerTranslationId: 'ESV',
      isAvailable: true,
      isPublicDomain: false,
      copyrightNotice:
        'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway. Used by permission. All rights reserved.',
      sortOrder: 50,
    });
  }

  const apiBibleKey = Deno.env.get('API_BIBLE_KEY');
  if (apiBibleKey) {
    try {
      const res = await fetch(`${API_BIBLE}/bibles?language=eng`, {
        headers: { 'api-key': apiBibleKey },
      });
      if (res.ok) {
        const payload = (await res.json()) as {
          data?: Array<{ id: string; abbreviation: string; abbreviationLocal: string; name: string; copyright?: string }>;
        };
        for (const bible of payload.data ?? []) {
          const abbreviation = (bible.abbreviationLocal || bible.abbreviation || '').toUpperCase();
          if (!abbreviation) continue;
          available.push({
            abbreviation,
            name: bible.name,
            language: 'English',
            provider: 'api.bible',
            providerTranslationId: bible.id,
            isAvailable: true,
            isPublicDomain: false,
            copyrightNotice: bible.copyright ?? null,
            sortOrder: 500,
          });
        }
      }
    } catch {
      // Provider unreachable — report only what we are sure of.
    }
  }

  translationCache = { at: Date.now(), value: available };
  return available;
}

async function resolveApiBibleId(translation: string): Promise<string | null> {
  const list = (await listTranslations()) as Array<{
    abbreviation: string;
    provider: string;
    providerTranslationId: string;
  }>;
  return (
    list.find((t) => t.provider === 'api.bible' && t.abbreviation === translation)?.providerTranslationId ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* Crossway ESV                                                               */
/* -------------------------------------------------------------------------- */

async function fetchEsv(reference: string, chapter: number) {
  const params = new URLSearchParams({
    q: reference,
    'include-passage-references': 'false',
    'include-verse-numbers': 'true',
    'include-first-verse-numbers': 'true',
    'include-footnotes': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'indent-poetry': 'false',
  });
  const res = await fetch(`${ESV_API}?${params}`, {
    headers: { Authorization: `Token ${Deno.env.get('ESV_API_KEY')}` },
  });
  if (!res.ok) throw new Error(`ESV API returned ${res.status}.`);
  const payload = (await res.json()) as { passages?: string[] };
  const passage = payload.passages?.[0] ?? '';
  if (!passage.trim()) throw new Error('The ESV API returned no text for that reference.');

  const verses: Verse[] = [];
  // The ESV text API marks verses as "[12] text".
  const parts = passage.split(/\[(\d+)\]/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const verse = Number(parts[i]);
    const text = (parts[i + 1] ?? '').replace(/\s+/g, ' ').trim();
    if (verse && text) verses.push({ chapter, verse, text });
  }

  return {
    verses,
    source: 'esv',
    copyright:
      'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway. Used by permission. All rights reserved.',
  };
}

/* -------------------------------------------------------------------------- */
/* API.Bible                                                                  */
/* -------------------------------------------------------------------------- */

async function fetchApiBible(
  bibleId: string,
  bookId: string,
  chapter: number,
  startVerse: number | null,
  endVerse: number | null,
  endChapter: number | null,
) {
  const usfm = USFM[bookId];
  if (!usfm) throw new Error(`No provider identifier for ${bookId}.`);

  const from = startVerse === null ? `${usfm}.${chapter}` : `${usfm}.${chapter}.${startVerse}`;
  const to =
    startVerse === null
      ? null
      : endChapter && endVerse
        ? `${usfm}.${endChapter}.${endVerse}`
        : endVerse
          ? `${usfm}.${chapter}.${endVerse}`
          : null;
  const passageId = to ? `${from}-${to}` : from;

  const params = new URLSearchParams({
    'content-type': 'json',
    'include-notes': 'false',
    'include-titles': 'false',
    'include-chapter-numbers': 'false',
    'include-verse-numbers': 'true',
    'include-verse-spans': 'false',
  });

  const res = await fetch(`${API_BIBLE}/bibles/${bibleId}/passages/${passageId}?${params}`, {
    headers: { 'api-key': Deno.env.get('API_BIBLE_KEY') ?? '' },
  });
  if (!res.ok) throw new Error(`The Bible provider returned ${res.status}.`);

  const payload = (await res.json()) as {
    data?: { content?: unknown; copyright?: string };
  };

  const verses = extractVerses(payload.data?.content, chapter);
  if (verses.length === 0) throw new Error('The provider returned no verses for that reference.');

  return { verses, source: 'api.bible', copyright: payload.data?.copyright ?? null };
}

/** Walks API.Bible's nested JSON content and pulls out numbered verses. */
function extractVerses(content: unknown, defaultChapter: number): Verse[] {
  const verses = new Map<string, Verse>();
  let currentChapter = defaultChapter;
  let currentVerse = 0;

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    const attrs = record.attrs as Record<string, unknown> | undefined;
    if (record.name === 'verse' && attrs?.number) {
      currentVerse = Number(attrs.number);
      const sid = String(attrs.sid ?? '');
      const parsed = /\.(\d+)\.(\d+)$/.exec(sid);
      if (parsed) {
        currentChapter = Number(parsed[1]);
        currentVerse = Number(parsed[2]);
      }
    }
    if (record.name === 'chapter' && attrs?.number) {
      currentChapter = Number(attrs.number);
    }

    if (typeof record.text === 'string' && currentVerse > 0) {
      const key = `${currentChapter}:${currentVerse}`;
      const existing = verses.get(key);
      const text = record.text.replace(/\s+/g, ' ');
      if (existing) {
        existing.text = `${existing.text}${text}`.replace(/\s+/g, ' ');
      } else {
        verses.set(key, { chapter: currentChapter, verse: currentVerse, text });
      }
    }

    if (record.items) walk(record.items);
    if (record.content) walk(record.content);
  };

  walk(content);
  return [...verses.values()]
    .map((verse) => ({ ...verse, text: verse.text.trim() }))
    .filter((verse) => verse.text)
    .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}
