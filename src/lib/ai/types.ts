export type ExplanationMode = 'simple' | 'deep' | 'scholar';

export const EXPLANATION_MODES: Array<{ id: ExplanationMode; label: string; blurb: string }> = [
  { id: 'simple', label: 'Simple Explanation', blurb: 'Plain meaning and how it touches everyday life.' },
  { id: 'deep', label: 'Deep Explanation', blurb: 'Context, key words, original language and application.' },
  { id: 'scholar', label: 'Scholar Explanation', blurb: 'Authorship, genre, theology and where interpreters differ.' },
];

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

export interface FollowUpAnswer {
  answer: string;
  relatedScripture: RelatedScripture[];
  suggestedQuestions: string[];
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
