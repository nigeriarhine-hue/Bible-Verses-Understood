/**
 * Canonical book metadata for the 66-book Protestant canon.
 *
 * `id` is the URL slug, `name` is what we render, `source` is the spelling used
 * by the public-domain datasets we normalise in scripts/build-bible-data.mjs,
 * and `aliases` feed the reference parser (see reference.ts).
 */

export type Testament = 'old' | 'new';

export interface BookMeta {
  /** URL-safe slug, e.g. "1-corinthians". */
  id: string;
  /** Display name, e.g. "1 Corinthians". */
  name: string;
  /** Spelling used by the bundled dataset, e.g. "I Corinthians". */
  source: string;
  testament: Testament;
  /** 1-based canonical order (Genesis = 1). */
  order: number;
  /** Number of chapters. */
  chapters: number;
  /** Lower-case alternative spellings and abbreviations used when parsing. */
  aliases: string[];
}

export const BOOKS: BookMeta[] = [
  { id: 'genesis', name: 'Genesis', source: 'Genesis', testament: 'old', order: 1, chapters: 50, aliases: ['gen', 'ge', 'gn'] },
  { id: 'exodus', name: 'Exodus', source: 'Exodus', testament: 'old', order: 2, chapters: 40, aliases: ['exo', 'ex', 'exod'] },
  { id: 'leviticus', name: 'Leviticus', source: 'Leviticus', testament: 'old', order: 3, chapters: 27, aliases: ['lev', 'le', 'lv'] },
  { id: 'numbers', name: 'Numbers', source: 'Numbers', testament: 'old', order: 4, chapters: 36, aliases: ['num', 'nu', 'nm', 'nb'] },
  { id: 'deuteronomy', name: 'Deuteronomy', source: 'Deuteronomy', testament: 'old', order: 5, chapters: 34, aliases: ['deut', 'dt', 'de'] },
  { id: 'joshua', name: 'Joshua', source: 'Joshua', testament: 'old', order: 6, chapters: 24, aliases: ['josh', 'jos', 'jsh'] },
  { id: 'judges', name: 'Judges', source: 'Judges', testament: 'old', order: 7, chapters: 21, aliases: ['judg', 'jdg', 'jg', 'jdgs'] },
  { id: 'ruth', name: 'Ruth', source: 'Ruth', testament: 'old', order: 8, chapters: 4, aliases: ['rth', 'ru'] },
  { id: '1-samuel', name: '1 Samuel', source: 'I Samuel', testament: 'old', order: 9, chapters: 31, aliases: ['1 sam', '1sam', '1 sa', '1sa', 'first samuel', '1st samuel', 'i samuel'] },
  { id: '2-samuel', name: '2 Samuel', source: 'II Samuel', testament: 'old', order: 10, chapters: 24, aliases: ['2 sam', '2sam', '2 sa', '2sa', 'second samuel', '2nd samuel', 'ii samuel'] },
  { id: '1-kings', name: '1 Kings', source: 'I Kings', testament: 'old', order: 11, chapters: 22, aliases: ['1 kgs', '1kgs', '1 ki', '1ki', 'first kings', '1st kings', 'i kings'] },
  { id: '2-kings', name: '2 Kings', source: 'II Kings', testament: 'old', order: 12, chapters: 25, aliases: ['2 kgs', '2kgs', '2 ki', '2ki', 'second kings', '2nd kings', 'ii kings'] },
  { id: '1-chronicles', name: '1 Chronicles', source: 'I Chronicles', testament: 'old', order: 13, chapters: 29, aliases: ['1 chron', '1chron', '1 chr', '1chr', 'first chronicles', '1st chronicles', 'i chronicles'] },
  { id: '2-chronicles', name: '2 Chronicles', source: 'II Chronicles', testament: 'old', order: 14, chapters: 36, aliases: ['2 chron', '2chron', '2 chr', '2chr', 'second chronicles', '2nd chronicles', 'ii chronicles'] },
  { id: 'ezra', name: 'Ezra', source: 'Ezra', testament: 'old', order: 15, chapters: 10, aliases: ['ezr'] },
  { id: 'nehemiah', name: 'Nehemiah', source: 'Nehemiah', testament: 'old', order: 16, chapters: 13, aliases: ['neh', 'ne'] },
  { id: 'esther', name: 'Esther', source: 'Esther', testament: 'old', order: 17, chapters: 10, aliases: ['esth', 'est', 'es'] },
  { id: 'job', name: 'Job', source: 'Job', testament: 'old', order: 18, chapters: 42, aliases: ['jb'] },
  { id: 'psalms', name: 'Psalms', source: 'Psalms', testament: 'old', order: 19, chapters: 150, aliases: ['psalm', 'ps', 'psa', 'pslm', 'psm', 'pss'] },
  { id: 'proverbs', name: 'Proverbs', source: 'Proverbs', testament: 'old', order: 20, chapters: 31, aliases: ['prov', 'pro', 'prv', 'pr'] },
  { id: 'ecclesiastes', name: 'Ecclesiastes', source: 'Ecclesiastes', testament: 'old', order: 21, chapters: 12, aliases: ['eccl', 'ecc', 'ec', 'qoheleth'] },
  { id: 'song-of-solomon', name: 'Song of Solomon', source: 'Song of Solomon', testament: 'old', order: 22, chapters: 8, aliases: ['song', 'song of songs', 'sos', 'canticles', 'cant', 'sng'] },
  { id: 'isaiah', name: 'Isaiah', source: 'Isaiah', testament: 'old', order: 23, chapters: 66, aliases: ['isa', 'is'] },
  { id: 'jeremiah', name: 'Jeremiah', source: 'Jeremiah', testament: 'old', order: 24, chapters: 52, aliases: ['jer', 'je', 'jr'] },
  { id: 'lamentations', name: 'Lamentations', source: 'Lamentations', testament: 'old', order: 25, chapters: 5, aliases: ['lam', 'la'] },
  { id: 'ezekiel', name: 'Ezekiel', source: 'Ezekiel', testament: 'old', order: 26, chapters: 48, aliases: ['ezek', 'eze', 'ezk'] },
  { id: 'daniel', name: 'Daniel', source: 'Daniel', testament: 'old', order: 27, chapters: 12, aliases: ['dan', 'da', 'dn'] },
  { id: 'hosea', name: 'Hosea', source: 'Hosea', testament: 'old', order: 28, chapters: 14, aliases: ['hos', 'ho'] },
  { id: 'joel', name: 'Joel', source: 'Joel', testament: 'old', order: 29, chapters: 3, aliases: ['joe', 'jl'] },
  { id: 'amos', name: 'Amos', source: 'Amos', testament: 'old', order: 30, chapters: 9, aliases: ['amo', 'am'] },
  { id: 'obadiah', name: 'Obadiah', source: 'Obadiah', testament: 'old', order: 31, chapters: 1, aliases: ['obad', 'oba', 'ob'] },
  { id: 'jonah', name: 'Jonah', source: 'Jonah', testament: 'old', order: 32, chapters: 4, aliases: ['jon', 'jnh'] },
  { id: 'micah', name: 'Micah', source: 'Micah', testament: 'old', order: 33, chapters: 7, aliases: ['mic', 'mc'] },
  { id: 'nahum', name: 'Nahum', source: 'Nahum', testament: 'old', order: 34, chapters: 3, aliases: ['nah', 'na'] },
  { id: 'habakkuk', name: 'Habakkuk', source: 'Habakkuk', testament: 'old', order: 35, chapters: 3, aliases: ['hab', 'hb'] },
  { id: 'zephaniah', name: 'Zephaniah', source: 'Zephaniah', testament: 'old', order: 36, chapters: 3, aliases: ['zeph', 'zep', 'zp'] },
  { id: 'haggai', name: 'Haggai', source: 'Haggai', testament: 'old', order: 37, chapters: 2, aliases: ['hag', 'hg'] },
  { id: 'zechariah', name: 'Zechariah', source: 'Zechariah', testament: 'old', order: 38, chapters: 14, aliases: ['zech', 'zec', 'zc'] },
  { id: 'malachi', name: 'Malachi', source: 'Malachi', testament: 'old', order: 39, chapters: 4, aliases: ['mal', 'ml'] },
  { id: 'matthew', name: 'Matthew', source: 'Matthew', testament: 'new', order: 40, chapters: 28, aliases: ['matt', 'mat', 'mt'] },
  { id: 'mark', name: 'Mark', source: 'Mark', testament: 'new', order: 41, chapters: 16, aliases: ['mrk', 'mar', 'mk', 'mr'] },
  { id: 'luke', name: 'Luke', source: 'Luke', testament: 'new', order: 42, chapters: 24, aliases: ['luk', 'lk'] },
  { id: 'john', name: 'John', source: 'John', testament: 'new', order: 43, chapters: 21, aliases: ['joh', 'jhn', 'jn'] },
  { id: 'acts', name: 'Acts', source: 'Acts', testament: 'new', order: 44, chapters: 28, aliases: ['act', 'ac', 'acts of the apostles'] },
  { id: 'romans', name: 'Romans', source: 'Romans', testament: 'new', order: 45, chapters: 16, aliases: ['rom', 'ro', 'rm'] },
  { id: '1-corinthians', name: '1 Corinthians', source: 'I Corinthians', testament: 'new', order: 46, chapters: 16, aliases: ['1 cor', '1cor', '1 co', '1co', 'first corinthians', '1st corinthians', 'i corinthians'] },
  { id: '2-corinthians', name: '2 Corinthians', source: 'II Corinthians', testament: 'new', order: 47, chapters: 13, aliases: ['2 cor', '2cor', '2 co', '2co', 'second corinthians', '2nd corinthians', 'ii corinthians'] },
  { id: 'galatians', name: 'Galatians', source: 'Galatians', testament: 'new', order: 48, chapters: 6, aliases: ['gal', 'ga'] },
  { id: 'ephesians', name: 'Ephesians', source: 'Ephesians', testament: 'new', order: 49, chapters: 6, aliases: ['eph', 'ep'] },
  { id: 'philippians', name: 'Philippians', source: 'Philippians', testament: 'new', order: 50, chapters: 4, aliases: ['phil', 'php', 'pp'] },
  { id: 'colossians', name: 'Colossians', source: 'Colossians', testament: 'new', order: 51, chapters: 4, aliases: ['col', 'cl'] },
  { id: '1-thessalonians', name: '1 Thessalonians', source: 'I Thessalonians', testament: 'new', order: 52, chapters: 5, aliases: ['1 thess', '1thess', '1 th', '1th', 'first thessalonians', '1st thessalonians', 'i thessalonians'] },
  { id: '2-thessalonians', name: '2 Thessalonians', source: 'II Thessalonians', testament: 'new', order: 53, chapters: 3, aliases: ['2 thess', '2thess', '2 th', '2th', 'second thessalonians', '2nd thessalonians', 'ii thessalonians'] },
  { id: '1-timothy', name: '1 Timothy', source: 'I Timothy', testament: 'new', order: 54, chapters: 6, aliases: ['1 tim', '1tim', '1 ti', '1ti', 'first timothy', '1st timothy', 'i timothy'] },
  { id: '2-timothy', name: '2 Timothy', source: 'II Timothy', testament: 'new', order: 55, chapters: 4, aliases: ['2 tim', '2tim', '2 ti', '2ti', 'second timothy', '2nd timothy', 'ii timothy'] },
  { id: 'titus', name: 'Titus', source: 'Titus', testament: 'new', order: 56, chapters: 3, aliases: ['tit', 'ti'] },
  { id: 'philemon', name: 'Philemon', source: 'Philemon', testament: 'new', order: 57, chapters: 1, aliases: ['philem', 'phm', 'pm'] },
  { id: 'hebrews', name: 'Hebrews', source: 'Hebrews', testament: 'new', order: 58, chapters: 13, aliases: ['heb', 'hb'] },
  { id: 'james', name: 'James', source: 'James', testament: 'new', order: 59, chapters: 5, aliases: ['jas', 'jm'] },
  { id: '1-peter', name: '1 Peter', source: 'I Peter', testament: 'new', order: 60, chapters: 5, aliases: ['1 pet', '1pet', '1 pe', '1pe', '1 pt', '1pt', 'first peter', '1st peter', 'i peter'] },
  { id: '2-peter', name: '2 Peter', source: 'II Peter', testament: 'new', order: 61, chapters: 3, aliases: ['2 pet', '2pet', '2 pe', '2pe', '2 pt', '2pt', 'second peter', '2nd peter', 'ii peter'] },
  { id: '1-john', name: '1 John', source: 'I John', testament: 'new', order: 62, chapters: 5, aliases: ['1 jn', '1jn', '1 jhn', '1jhn', '1 joh', 'first john', '1st john', 'i john'] },
  { id: '2-john', name: '2 John', source: 'II John', testament: 'new', order: 63, chapters: 1, aliases: ['2 jn', '2jn', '2 jhn', '2jhn', '2 joh', 'second john', '2nd john', 'ii john'] },
  { id: '3-john', name: '3 John', source: 'III John', testament: 'new', order: 64, chapters: 1, aliases: ['3 jn', '3jn', '3 jhn', '3jhn', '3 joh', 'third john', '3rd john', 'iii john'] },
  { id: 'jude', name: 'Jude', source: 'Jude', testament: 'new', order: 65, chapters: 1, aliases: ['jud', 'jd'] },
  { id: 'revelation', name: 'Revelation', source: 'Revelation of John', testament: 'new', order: 66, chapters: 22, aliases: ['rev', 're', 'rv', 'apocalypse', 'revelations', 'revelation of john', 'the revelation'] },
];

export const OLD_TESTAMENT = BOOKS.filter((b) => b.testament === 'old');
export const NEW_TESTAMENT = BOOKS.filter((b) => b.testament === 'new');

const BY_ID = new Map(BOOKS.map((b) => [b.id, b]));

export function getBook(id: string): BookMeta | undefined {
  return BY_ID.get(id);
}

/** Books with a single chapter, where "Jude 4" means verse 4, not chapter 4. */
export const SINGLE_CHAPTER_BOOKS = new Set(
  BOOKS.filter((b) => b.chapters === 1).map((b) => b.id),
);
