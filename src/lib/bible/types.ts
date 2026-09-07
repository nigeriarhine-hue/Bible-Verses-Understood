export interface BibleReference {
  /** Book slug, e.g. "1-corinthians". */
  bookId: string;
  /** Display book name, e.g. "1 Corinthians". */
  book: string;
  chapter: number;
  /** null means "the whole chapter". */
  startVerse: number | null;
  /** null means "single verse" (or, with startVerse null, the whole chapter). */
  endVerse: number | null;
  /** Set only for spans that cross a chapter boundary, e.g. Romans 8:38-9:2. */
  endChapter?: number | null;
  /** Canonical display form, e.g. "Romans 8:28-30". */
  reference: string;
}

export interface Verse {
  chapter: number;
  verse: number;
  text: string;
}

export interface Passage {
  reference: BibleReference;
  /** Translation abbreviation the text was actually served in. */
  translation: string;
  translationName: string;
  verses: Verse[];
  /** Joined verse text, convenient for prompts and share cards. */
  text: string;
  copyright?: string;
  /** Where the Scripture came from — never a generative model. */
  source: 'local' | 'api.bible' | 'esv';
}

export interface ChapterContent {
  reference: BibleReference;
  translation: string;
  translationName: string;
  verses: Verse[];
  copyright?: string;
}

export interface TranslationInfo {
  abbreviation: string;
  name: string;
  language: string;
  provider: 'local' | 'api.bible' | 'esv' | null;
  providerTranslationId?: string | null;
  isAvailable: boolean;
  isPublicDomain: boolean;
  copyrightNotice?: string | null;
  sortOrder: number;
}
