/**
 * POST /functions/v1/study
 *
 * Writes the Simple, Deep or Scholar explanation for a passage that the caller
 * has already retrieved from a Bible source. This function never supplies Bible
 * text — it only comments on the text it is given.
 *
 * Body: { reference, translation, mode, scriptureText }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, generateJson, hasGeminiKey } from '../_shared/gemini.ts';
import { validateRelated, type RelatedReference } from '../_shared/books.ts';
import {
  STUDY_SCHEMA,
  scriptureBlock,
  studySystemPrompt,
  type ExplanationMode,
} from '../_shared/prompts.ts';
import {
  callerKey,
  isRateLimited,
  readStudyCache,
  studyCacheKey,
  writeStudyCache,
} from '../_shared/store.ts';

const MODES: ExplanationMode[] = ['simple', 'deep', 'scholar'];
// Comfortably above the Bible's longest chapter (Psalm 119, ~13,200
// characters in the KJV), so any real passage can be studied whole.
const MAX_SCRIPTURE_CHARS = 20_000;

interface StudyResponse {
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

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);

  if (isRateLimited(`study:${callerKey(req)}`, 20)) {
    return failure(req, 'Too many study requests. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  const reference = String(body.reference ?? '').trim();
  const translation = String(body.translation ?? '').trim().toUpperCase();
  const mode = String(body.mode ?? 'simple').toLowerCase() as ExplanationMode;
  const scriptureText = String(body.scriptureText ?? '').trim();

  if (!reference) return failure(req, 'A Bible reference is required.');
  if (!translation) return failure(req, 'A translation is required.');
  if (!MODES.includes(mode)) return failure(req, `Unknown explanation mode: ${mode}`);
  if (!scriptureText) return failure(req, 'The Scripture text for this passage is required.');
  if (scriptureText.length > MAX_SCRIPTURE_CHARS) {
    return failure(req, 'That passage is too long to study in one request. Try a shorter range.');
  }
  if (!hasGeminiKey()) {
    return failure(
      req,
      'Explanations are not available yet: the commentary service has not been configured for this deployment.',
      503,
      { code: 'commentary_not_configured' },
    );
  }

  const cacheKey = await studyCacheKey(reference, translation, mode, scriptureText);
  const cached = await readStudyCache<StudyResponse>(cacheKey);
  if (cached) return json(req, { ...cached, cached: true });

  const prompt = [
    scriptureBlock(reference, translation, scriptureText),
    '',
    `Write the ${mode} explanation of ${reference} described in your instructions.`,
  ].join('\n');

  try {
    const raw = await generateJson<Record<string, unknown>>({
      system: studySystemPrompt(mode),
      prompt,
      schema: STUDY_SCHEMA,
      temperature: mode === 'scholar' ? 0.4 : 0.6,
      maxOutputTokens: mode === 'simple' ? 2048 : 6144,
    });

    const related = Array.isArray(raw.relatedScripture)
      ? (raw.relatedScripture as Array<Record<string, unknown>>)
          .map((entry) => validateRelated(entry))
          .filter((entry): entry is RelatedReference => entry !== null)
          .filter((entry) => entry.reference !== reference)
          .slice(0, 6)
      : [];

    const sections = Array.isArray(raw.sections)
      ? (raw.sections as Array<Record<string, unknown>>)
          .map((section) => ({
            heading: String(section.heading ?? '').trim(),
            body: String(section.body ?? '').trim(),
          }))
          .filter((section) => section.heading && section.body)
      : [];

    if (sections.length === 0) {
      return failure(req, 'The commentary service returned an unusable response. Please try again.', 502);
    }

    const response: StudyResponse = {
      reference,
      translation,
      mode,
      summary: String(raw.summary ?? '').trim(),
      sections,
      keyTerms: normaliseKeyTerms(raw.keyTerms),
      interpretations: normaliseInterpretations(raw.interpretations),
      reflectionQuestions: normaliseStrings(raw.reflectionQuestions),
      prayer: optionalString(raw.prayer),
      relatedScripture: related,
    };

    await writeStudyCache(cacheKey, reference, translation, mode, response);
    return json(req, response);
  } catch (error) {
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'The explanation could not be generated. Please try again.', 502);
  }
});

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
