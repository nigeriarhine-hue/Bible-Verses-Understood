/**
 * Turning a passage into the two things this product generates.
 *
 * Lifted out of the request handlers so the scheduled prewarm can produce
 * exactly what a reader would have got, byte for byte, rather than a near
 * copy that would miss the cache the moment somebody asked for it.
 *
 * Nothing here knows about HTTP, callers, allowances or caching. The handlers
 * decide whether a generation is allowed and where the result belongs; this
 * decides only what the result is.
 */
import { generateJson } from './gemini.ts';
import { validateRelated, type RelatedReference } from './books.ts';
import {
  DEVOTIONAL_SCHEMA,
  GUARDRAILS,
  RELATED_SCRIPTURE_INSTRUCTION,
  STUDY_SCHEMA,
  VOICE,
  scriptureBlock,
  studySystemPrompt,
  type ExplanationMode,
} from './prompts.ts';

/** The only mode that generates. */
export const GENERATED_MODE: ExplanationMode = 'simple';

export interface StudyResponse {
  reference: string;
  translation: string;
  mode: ExplanationMode;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  keyTerms?: Array<{
    term: string;
    original?: string | null;
    transliteration?: string | null;
    language?: string | null;
    meaning: string;
  }>;
  interpretations?: Array<{ position: string; heldBy?: string | null; summary: string }>;
  reflectionQuestions?: string[];
  prayer?: string | null;
  relatedScripture: RelatedReference[];
  cached?: boolean;
}

export interface DevotionalResponse {
  reference: string;
  translation: string;
  title: string;
  sections: Array<{ heading: string; body: string }>;
  reflectionQuestion: string;
  prayer: string;
  isPersonalized: boolean;
  relatedScripture: RelatedReference[];
  cached?: boolean;
}

/** Thrown when the model answered but the answer was not usable. */
export class UnusableResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableResponseError';
  }
}

/**
 * The Simple Explanation.
 *
 * Low thinking and the standard tier: a 300-word piece about text supplied in
 * full does not need heavy reasoning, and reasoning is billed and spent from
 * the same output budget as the answer.
 */
export async function generateSimpleStudy(
  reference: string,
  translation: string,
  scriptureText: string,
): Promise<StudyResponse> {
  const raw = await generateJson<Record<string, unknown>>({
    system: studySystemPrompt(),
    prompt: [
      scriptureBlock(reference, translation, scriptureText),
      '',
      `Write the simple explanation of ${reference} described in your instructions.`,
    ].join('\n'),
    schema: STUDY_SCHEMA,
    temperature: 0.6,
    thinkingLevel: 'low',
    budget: 'standard',
  });

  const sections = normaliseSections(raw.sections);
  if (sections.length === 0) {
    throw new UnusableResponseError('The commentary service returned an unusable response.');
  }

  return {
    reference,
    translation,
    mode: GENERATED_MODE,
    summary: String(raw.summary ?? '').trim(),
    sections,
    keyTerms: normaliseKeyTerms(raw.keyTerms),
    interpretations: normaliseInterpretations(raw.interpretations),
    reflectionQuestions: normaliseStrings(raw.reflectionQuestions),
    prayer: optionalString(raw.prayer),
    relatedScripture: normaliseRelated(raw.relatedScripture, reference, 6),
  };
}

function devotionalSystemPrompt(): string {
  return [
    'You write the daily devotional for Bible Verses Understood: one short,',
    'unhurried reading that helps someone start or end a day with Scripture.',
    '',
    VOICE,
    '',
    GUARDRAILS,
    '',
    'Use these headings, in this order: "Today\'s Scripture" (two or three',
    'sentences setting the passage in its context — do not restate the verse),',
    '"Today\'s Thought", "Deeper Reflection", "For Your Life",',
    '"One Small Action" (a single specific, achievable step today).',
    'Then a reflection question and a short prayer of three or four sentences.',
    'Around 350-450 words in total across the sections. Be concise and do not',
    'repeat between sections; stop when the thought is complete rather than',
    'filling the space.',
    '',
    RELATED_SCRIPTURE_INSTRUCTION,
    'Return 2 related passages.',
    '',
    'Return JSON matching the schema. Section bodies are plain prose with no',
    'Markdown formatting.',
  ].join('\n');
}

/**
 * A devotional, general or shaped by what a reader said matters to them.
 *
 * The interests are used for this one request. Whether the result may be
 * shared is the caller's decision, and the caller is the one that knows.
 */
export async function generateDevotional(
  reference: string,
  translation: string,
  scriptureText: string,
  interests: string[] = [],
): Promise<DevotionalResponse> {
  const personalised = interests.length > 0;
  const raw = await generateJson<Record<string, unknown>>({
    system: devotionalSystemPrompt(),
    prompt: [
      scriptureBlock(reference, translation, scriptureText),
      '',
      personalised
        ? `Write today's devotional. The reader has said these subjects matter to them right now: ${interests.join(', ')}. Let one or two of those shape the reflection where the passage genuinely supports it — never force a connection, and never claim to know their circumstances.`
        : "Write today's devotional for a general reader.",
    ].join('\n'),
    schema: DEVOTIONAL_SCHEMA,
    temperature: 0.7,
    thinkingLevel: 'low',
    budget: 'standard',
  });

  const sections = normaliseSections(raw.sections);
  if (sections.length === 0) {
    throw new UnusableResponseError('The devotional could not be generated.');
  }

  return {
    reference,
    translation,
    title: String(raw.title ?? '').trim() || 'Today’s Devotional',
    sections,
    reflectionQuestion: String(raw.reflectionQuestion ?? '').trim(),
    prayer: String(raw.prayer ?? '').trim(),
    isPersonalized: personalised,
    relatedScripture: normaliseRelated(raw.relatedScripture, reference, 3),
  };
}

/* -------------------------------------------------------------------------- */
/* Reading model output defensively                                           */
/* -------------------------------------------------------------------------- */

function normaliseSections(value: unknown): Array<{ heading: string; body: string }> {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>)
    .map((section) => ({
      heading: String(section.heading ?? '').trim(),
      body: String(section.body ?? '').trim(),
    }))
    .filter((section) => section.heading && section.body);
}

/** Every reference is checked against the Bible; invented ones are dropped. */
function normaliseRelated(value: unknown, exclude: string, limit: number): RelatedReference[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>)
    .map((entry) => validateRelated(entry))
    .filter((entry): entry is RelatedReference => entry !== null)
    .filter((entry) => entry.reference !== exclude)
    .slice(0, limit);
}

function normaliseKeyTerms(value: unknown): StudyResponse['keyTerms'] {
  if (!Array.isArray(value)) return undefined;
  const terms = value
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      const term = String(record.term ?? '').trim();
      const meaning = String(record.meaning ?? '').trim();
      if (!term || !meaning) return null;
      return {
        term,
        meaning,
        original: optionalString(record.original),
        transliteration: optionalString(record.transliteration),
        language: optionalString(record.language),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return terms.length ? terms : undefined;
}

function normaliseInterpretations(value: unknown): StudyResponse['interpretations'] {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      const position = String(record.position ?? '').trim();
      const summary = String(record.summary ?? '').trim();
      if (!position || !summary) return null;
      return { position, summary, heldBy: optionalString(record.heldBy) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return items.length ? items : undefined;
}

function normaliseStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function optionalString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}
