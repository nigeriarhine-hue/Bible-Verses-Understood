import { BOOKS, SINGLE_CHAPTER_BOOKS, getBook, type BookMeta } from './books';
import type { BibleReference } from './types';

/* -------------------------------------------------------------------------- */
/* Number words — "Psalm twenty-three", "Romans eight twenty-eight"            */
/* -------------------------------------------------------------------------- */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const ORDINAL_TO_CARDINAL: Record<string, string> = {
  first: 'one', second: 'two', third: 'three', fourth: 'four', fifth: 'five',
  sixth: 'six', seventh: 'seven', eighth: 'eight', ninth: 'nine', tenth: 'ten',
  eleventh: 'eleven', twelfth: 'twelve', thirteenth: 'thirteen',
  fourteenth: 'fourteen', fifteenth: 'fifteen', sixteenth: 'sixteen',
  seventeenth: 'seventeen', eighteenth: 'eighteen', nineteenth: 'nineteen',
  twentieth: 'twenty', thirtieth: 'thirty', fortieth: 'forty',
  fiftieth: 'fifty', sixtieth: 'sixty', seventieth: 'seventy',
  eightieth: 'eighty', ninetieth: 'ninety', hundredth: 'hundred',
};

/**
 * Reads a run of number words into the numbers they spell.
 *
 * "twenty three" is one number (23) but "eight twenty eight" is two (8, 28) —
 * so a tens word only absorbs the next unit, and a bare unit ends the number.
 */
function readNumberWords(words: string[]): number[] | null {
  const numbers: number[] = [];
  let current: number | null = null;
  // True right after a tens word or "hundred", where a unit still attaches:
  // "twenty" + "three" = 23, but "eight" + "twenty" = 8, 20.
  let unitMayAttach = false;

  const flush = () => {
    if (current !== null) numbers.push(current);
    current = null;
    unitMayAttach = false;
  };

  for (const raw of words) {
    const word = ORDINAL_TO_CARDINAL[raw] ?? raw;
    if (word === 'and') {
      if (current === null) return null;
      continue;
    }
    if (word === 'a' && current === null) {
      current = 1;
      continue;
    }
    if (word === 'hundred') {
      if (current === null) return null;
      current *= 100;
      unitMayAttach = true;
      continue;
    }
    if (word in TENS) {
      if (current !== null && !unitMayAttach) flush();
      current = (current ?? 0) + TENS[word];
      unitMayAttach = true;
      continue;
    }
    if (word in UNITS) {
      const value = UNITS[word];
      if (current === null) {
        current = value;
      } else if (unitMayAttach) {
        current += value;
      } else {
        flush();
        current = value;
      }
      unitMayAttach = false;
      continue;
    }
    return null; // not a number word — caller decides what to do
  }
  flush();
  return numbers.length ? numbers : null;
}

/* -------------------------------------------------------------------------- */
/* Book lookup                                                                */
/* -------------------------------------------------------------------------- */

/** Every spelling we accept, longest first so "1 john" beats "john". */
const BOOK_LOOKUP: Array<{ key: string; book: BookMeta }> = (() => {
  const entries: Array<{ key: string; book: BookMeta }> = [];
  for (const book of BOOKS) {
    const keys = new Set<string>([book.name.toLowerCase(), book.id.replace(/-/g, ' '), ...book.aliases]);
    // Numbered books: accept "1john", "1 john", "i john", "first john", "1st john".
    const numbered = /^([123])[- ](.+)$/.exec(book.id);
    if (numbered) {
      const [, digit, rest] = numbered;
      const roman = { '1': 'i', '2': 'ii', '3': 'iii' }[digit as '1' | '2' | '3'];
      const ordinal = { '1': 'first', '2': 'second', '3': 'third' }[digit as '1' | '2' | '3'];
      const ordinalShort = { '1': '1st', '2': '2nd', '3': '3rd' }[digit as '1' | '2' | '3'];
      for (const prefix of [digit, roman, ordinal, ordinalShort]) {
        keys.add(`${prefix} ${rest}`);
        keys.add(`${prefix}${rest}`);
      }
    }
    for (const key of keys) {
      const normalised = key.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
      if (normalised) entries.push({ key: normalised, book });
    }
  }
  // Deduplicate, keeping the first definition, then sort longest-first.
  const seen = new Set<string>();
  return entries
    .filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)))
    .sort((a, b) => b.key.length - a.key.length);
})();

/** Resolves a book name/abbreviation on its own. Returns undefined if unknown. */
export function findBook(input: string): BookMeta | undefined {
  const key = normalise(input);
  return BOOK_LOOKUP.find((entry) => entry.key === key)?.book;
}

const NUMBER_WORD_PATTERN =
  '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred)';

const HYPHENATED_NUMBER_WORDS = new RegExp(
  `(${NUMBER_WORD_PATTERN})-(${NUMBER_WORD_PATTERN})`,
  'g',
);

function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "twenty-three" is one number; the hyphen would otherwise read as a range.
    .replace(HYPHENATED_NUMBER_WORDS, '$1 $2');
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export interface ParseOptions {
  /** When true, only accept input that is *entirely* a reference. */
  strict?: boolean;
}

/**
 * Parses a human-written Bible reference.
 *
 * Handles "John 3:16", "John3:16", "John 3 16", "Jn 3:16", "Psalm twenty-three",
 * "Romans eight twenty-eight", "1 Cor 13", "First Corinthians 13",
 * "Romans 8:28-30" and "Romans 8:38-9:2". Returns null when the input is not a
 * reference, or names a chapter/verse the book does not contain.
 */
export function parseReference(input: string, options: ParseOptions = {}): BibleReference | null {
  if (!input) return null;
  let text = normalise(input);
  if (!text) return null;

  // Drop conversational lead-ins so "what does romans 8:28 mean" still resolves.
  if (!options.strict) {
    text = text.replace(
      /^(?:what does|what do|what is|what's|explain|tell me about|meaning of|read|show me|open|go to|look up|find|understand)\s+/,
      '',
    );
    text = text.replace(/\s+(?:mean|means|say|says|about|explained|explain|verse|passage)\??$/, '');
    text = text.replace(/\?+$/, '').trim();
  }

  const match = BOOK_LOOKUP.find(
    (entry) => text === entry.key || text.startsWith(`${entry.key} `) || startsWithBookThenDigit(text, entry.key),
  );
  if (!match) return null;

  const book = match.book;
  const rest = text.slice(match.key.length).trim();
  const numbers = extractNumbers(rest);
  if (numbers === null) return null;
  if (options.strict && numbers.leftover) return null;

  return buildReference(book, numbers.values, numbers.explicitVerseSeparator, numbers.rangeAfter);
}

function startsWithBookThenDigit(text: string, key: string): boolean {
  // "john3:16" — book name immediately followed by a digit.
  return text.startsWith(key) && /^\d/.test(text.slice(key.length));
}

interface ExtractedNumbers {
  values: Array<{ value: number; separator: ':' | '-' | ' ' | null }>;
  explicitVerseSeparator: boolean;
  rangeAfter: number | null;
  leftover: boolean;
}

/**
 * Pulls the chapter/verse numbers out of the text following a book name,
 * remembering which separator preceded each one so "3:16" and "3-16" differ.
 */
function extractNumbers(rest: string): ExtractedNumbers | null {
  if (!rest) return { values: [], explicitVerseSeparator: false, rangeAfter: null, leftover: false };

  const values: Array<{ value: number; separator: ':' | '-' | ' ' | null }> = [];
  let explicitVerseSeparator = false;
  let rangeAfter: number | null = null;
  let leftover = false;

  // Tokenise into digits, separators and words.
  const tokens = rest.match(/\d+|[:-]|[a-z]+/g) ?? [];
  let pendingSeparator: ':' | '-' | ' ' | null = null;
  let wordBuffer: string[] = [];

  const flushWords = () => {
    if (!wordBuffer.length) return true;
    const parsed = readNumberWords(wordBuffer);
    wordBuffer = [];
    if (!parsed) {
      leftover = true;
      return false;
    }
    for (const value of parsed) {
      values.push({ value, separator: pendingSeparator });
      pendingSeparator = ' ';
    }
    return true;
  };

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      if (!flushWords()) break;
      values.push({ value: Number(token), separator: pendingSeparator });
      pendingSeparator = null;
      continue;
    }
    if (token === ':' || token === 'v') {
      if (!flushWords()) break;
      pendingSeparator = ':';
      explicitVerseSeparator = true;
      continue;
    }
    if (token === '-') {
      if (!flushWords()) break;
      pendingSeparator = '-';
      rangeAfter = values.length - 1;
      continue;
    }
    // A word: either part of a spelled-out number, or trailing prose.
    if (token === 'verse' || token === 'verses' || token === 'chapter' || token === 'ch') {
      if (!flushWords()) break;
      if (token.startsWith('verse')) {
        pendingSeparator = ':';
        explicitVerseSeparator = true;
      }
      continue;
    }
    if (token === 'through' || token === 'to') {
      if (!flushWords()) break;
      pendingSeparator = '-';
      rangeAfter = values.length - 1;
      continue;
    }
    wordBuffer.push(token);
  }
  if (wordBuffer.length) flushWords();

  return { values, explicitVerseSeparator, rangeAfter, leftover };
}

function buildReference(
  book: BookMeta,
  values: Array<{ value: number; separator: ':' | '-' | ' ' | null }>,
  explicitVerseSeparator: boolean,
  _rangeAfter: number | null,
): BibleReference | null {
  const singleChapter = SINGLE_CHAPTER_BOOKS.has(book.id);

  if (values.length === 0) {
    return makeReference(book, 1, null, null, null);
  }

  // Single-chapter books: "Jude 4" means chapter 1, verse 4.
  if (singleChapter && !explicitVerseSeparator) {
    const start = values[0].value;
    const end = values[1]?.separator === '-' ? values[1].value : null;
    return makeReference(book, 1, start, end, null);
  }

  const chapter = values[0].value;
  if (chapter < 1 || chapter > book.chapters) return null;

  if (values.length === 1) {
    return makeReference(book, chapter, null, null, null);
  }

  const second = values[1];
  const startVerse = second.value;

  // "Psalm 23-24" — a chapter range. We open the first chapter.
  if (second.separator === '-' && !explicitVerseSeparator) {
    return makeReference(book, chapter, null, null, null);
  }

  const third = values[2];
  if (!third) return makeReference(book, chapter, startVerse, null, null);

  if (third.separator === '-') {
    const fourth = values[3];
    // "Romans 8:38-9:2" — the range crosses into another chapter.
    if (fourth && fourth.separator === ':') {
      const endChapter = third.value;
      if (endChapter < chapter || endChapter > book.chapters) return null;
      return makeReference(book, chapter, startVerse, fourth.value, endChapter);
    }
    return makeReference(book, chapter, startVerse, third.value, null);
  }

  return makeReference(book, chapter, startVerse, null, null);
}

function makeReference(
  book: BookMeta,
  chapter: number,
  startVerse: number | null,
  endVerse: number | null,
  endChapter: number | null,
): BibleReference | null {
  if (chapter < 1 || chapter > book.chapters) return null;
  if (startVerse !== null && startVerse < 1) return null;
  if (endVerse !== null && startVerse !== null && !endChapter && endVerse < startVerse) {
    // "John 3:16-14" — treat the second number as noise rather than failing.
    endVerse = null;
  }
  return {
    bookId: book.id,
    book: book.name,
    chapter,
    startVerse,
    endVerse: endVerse ?? null,
    endChapter: endChapter ?? null,
    reference: formatReference({
      bookId: book.id,
      book: book.name,
      chapter,
      startVerse,
      endVerse: endVerse ?? null,
      endChapter: endChapter ?? null,
    }),
  };
}

/** Renders a reference the way we display it everywhere. */
export function formatReference(ref: Omit<BibleReference, 'reference'>): string {
  const base = `${ref.book} ${ref.chapter}`;
  if (ref.startVerse === null) return base;
  if (ref.endChapter && ref.endChapter !== ref.chapter && ref.endVerse) {
    return `${base}:${ref.startVerse}-${ref.endChapter}:${ref.endVerse}`;
  }
  if (ref.endVerse && ref.endVerse !== ref.startVerse) {
    return `${base}:${ref.startVerse}-${ref.endVerse}`;
  }
  return `${base}:${ref.startVerse}`;
}

/** Builds the `/verse/...` URL path for a reference. */
export function referenceToPath(ref: BibleReference): string {
  const parts = [ref.bookId, String(ref.chapter)];
  if (ref.startVerse !== null) {
    let verse = String(ref.startVerse);
    if (ref.endChapter && ref.endChapter !== ref.chapter && ref.endVerse) {
      verse += `-${ref.endChapter}.${ref.endVerse}`;
    } else if (ref.endVerse && ref.endVerse !== ref.startVerse) {
      verse += `-${ref.endVerse}`;
    }
    parts.push(verse);
  }
  return `/verse/${parts.join('/')}`;
}

/** Inverse of referenceToPath; validates against the canon. */
export function pathToReference(
  bookId: string,
  chapter: string,
  verse?: string,
): BibleReference | null {
  const book = getBook(bookId);
  if (!book) return null;
  const chapterNumber = Number(chapter);
  if (!Number.isInteger(chapterNumber)) return null;
  if (!verse) return makeReference(book, chapterNumber, null, null, null);

  const rangeMatch = /^(\d+)(?:-(?:(\d+)\.)?(\d+))?$/.exec(verse);
  if (!rangeMatch) return null;
  const start = Number(rangeMatch[1]);
  const endChapter = rangeMatch[2] ? Number(rangeMatch[2]) : null;
  const end = rangeMatch[3] ? Number(rangeMatch[3]) : null;
  return makeReference(book, chapterNumber, start, end, endChapter);
}

/** Convenience: parse then confirm the reference exists in the canon. */
export function isValidReference(input: string): boolean {
  return parseReference(input) !== null;
}

/* -------------------------------------------------------------------------- */
/* Finding references inside prose                                            */
/* -------------------------------------------------------------------------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Book spellings we are willing to recognise inside prose. Two-letter
 * abbreviations ("is", "am", "ac") are excluded — in running text they produce
 * far more false positives than real references.
 */
const INLINE_BOOK_KEYS = BOOK_LOOKUP.map((entry) => entry.key).filter(
  (key) => key.replace(/[^a-z]/g, '').length >= 3,
);

const INLINE_REFERENCE = new RegExp(
  `\\b(${INLINE_BOOK_KEYS.map(escapeRegExp).join('|')})\\.?\\s?(\\d{1,3})` +
    `(?:\\s?[:.]\\s?(\\d{1,3})(?:\\s?[-\u2013\u2014]\\s?(?:(\\d{1,3})\\s?[:.]\\s?)?(\\d{1,3}))?)?`,
  'gi',
);

export interface InlineMatch {
  reference: BibleReference;
  start: number;
  end: number;
  raw: string;
}

/**
 * Finds Scripture references inside a block of prose so they can be rendered as
 * links. Only matches that resolve to a real book/chapter/verse are returned —
 * a generated "Hezekiah 3:4" is silently dropped rather than linked.
 */
export function findReferencesInText(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];
  INLINE_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_REFERENCE.exec(text))) {
    const raw = match[0].replace(/[\s.,;:]+$/, '');
    const parsed = parseReference(raw, { strict: true });
    if (!parsed) continue;
    matches.push({ reference: parsed, start: match.index, end: match.index + raw.length, raw });
  }
  return matches;
}
