/**
 * Still a union because saved studies, history rows and preferences written
 * before Deep and Scholar were retired carry those values. Nothing generates
 * them any more — the study function refuses them before it reaches Gemini.
 */
export type ExplanationMode = 'simple' | 'deep' | 'scholar';

/** The only explanation the product offers, and the only one that generates. */
export const EXPLANATION_MODE: ExplanationMode = 'simple';

/** What a reader sees this called. */
export const EXPLANATION_MODE_LABEL = 'Simple Explanation';

/**
 * Reads a stored mode back as the one that still exists.
 *
 * An old 'deep' or 'scholar' would otherwise be sent to the study function,
 * which refuses it — so the reader would see an error for a preference they
 * set months ago and cannot now change.
 */
export function normalizeExplanationMode(_stored?: string | null): ExplanationMode {
  return EXPLANATION_MODE;
}

export interface StudySection {
  heading: string;
  body: string;
}

export interface KeyTerm {
  term: string;
  original?: string | null;
  transliteration?: string | null;
  language?: string | null;
  meaning: string;
}

export interface Interpretation {
  position: string;
  heldBy?: string | null;
  summary: string;
}

/** A related passage as returned by the commentary service. */
export interface RelatedScripture {
  reference: string;
  book: string;
  chapter: number;
  startVerse: number | null;
  endVerse: number | null;
  relevanceExplanation: string;
}

export interface Study {
  reference: string;
  translation: string;
  mode: ExplanationMode;
  summary: string;
  sections: StudySection[];
  keyTerms?: KeyTerm[];
  interpretations?: Interpretation[];
  reflectionQuestions?: string[];
  prayer?: string | null;
  relatedScripture: RelatedScripture[];
  cached?: boolean;
}

export interface Devotional {
  reference: string;
  translation: string;
  title: string;
  sections: StudySection[];
  reflectionQuestion: string;
  prayer: string;
  isPersonalized: boolean;
  relatedScripture: RelatedScripture[];
}

export interface SituationGuidance {
  situationSummary: string;
  primaryReference: RelatedScripture;
  sections: StudySection[];
  prayer: string | null;
  relatedScripture: RelatedScripture[];
}

export class CommentaryError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'rate_limited' | 'failed',
  ) {
    super(message);
    this.name = 'CommentaryError';
  }
}
