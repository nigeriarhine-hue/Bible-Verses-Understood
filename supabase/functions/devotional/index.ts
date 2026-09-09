/**
 * POST /functions/v1/devotional
 *
 * Writes the daily devotional for a passage. When the reader has chosen topics
 * and left personalisation on, those interests shape the reflection — the
 * interests are the only personal data used, and they are not stored here.
 *
 * Body: { reference, translation, scriptureText, date?, interests?[] }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, generateJson, hasGeminiKey } from '../_shared/gemini.ts';
import { validateRelated, type RelatedReference } from '../_shared/books.ts';
import {
  DEVOTIONAL_SCHEMA,
  GUARDRAILS,
  RELATED_SCRIPTURE_INSTRUCTION,
  VOICE,
  scriptureBlock,
} from '../_shared/prompts.ts';
import {
  callerKey,
  isRateLimited,
  readStudyCache,
  studyCacheKey,
  writeStudyCache,
} from '../_shared/store.ts';

const MAX_SCRIPTURE_CHARS = 20_000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);

  if (isRateLimited(`devotional:${callerKey(req)}`, 20)) {
    return failure(req, 'Too many requests. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  const reference = String(body.reference ?? '').trim();
  const translation = String(body.translation ?? '').trim().toUpperCase();
  const scriptureText = String(body.scriptureText ?? '').trim();
  const interests = Array.isArray(body.interests)
    ? (body.interests as unknown[]).map((i) => String(i).trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!reference) return failure(req, 'A Bible reference is required.');
  if (!scriptureText) return failure(req, 'The Scripture text for this passage is required.');
  if (scriptureText.length > MAX_SCRIPTURE_CHARS) {
    return failure(req, 'That passage is too long for one request. Try a shorter range.');
  }
  if (!hasGeminiKey()) {
    return failure(req, "Today's devotional is not available: the commentary service is not configured.", 503, {
      code: 'commentary_not_configured',
    });
  }

  const personalised = interests.length > 0;
  // Personalised devotionals are not shared between readers, so they are only
  // cached when they are the general version.
  const cacheKey = personalised
    ? null
    : await studyCacheKey(reference, translation, 'devotional', scriptureText);
  if (cacheKey) {
    const cached = await readStudyCache<Record<string, unknown>>(cacheKey);
    if (cached) return json(req, { ...cached, cached: true });
  }

  const system = [
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
    'Around 400-550 words in total across the sections.',
    '',
    RELATED_SCRIPTURE_INSTRUCTION,
    'Return 2-3 related passages.',
    '',
    'Return JSON matching the schema. Section bodies are plain prose with no',
    'Markdown formatting.',
  ].join('\n');

  const prompt = [
    scriptureBlock(reference, translation, scriptureText),
    '',
    personalised
      ? `Write today's devotional. The reader has said these subjects matter to them right now: ${interests.join(', ')}. Let one or two of those shape the reflection where the passage genuinely supports it — never force a connection, and never claim to know their circumstances.`
      : "Write today's devotional for a general reader.",
  ].join('\n');

  try {
    const raw = await generateJson<Record<string, unknown>>({
      system,
      prompt,
      schema: DEVOTIONAL_SCHEMA,
      temperature: 0.7,
      budget: 'standard',
    });

    const sections = Array.isArray(raw.sections)
      ? (raw.sections as Array<Record<string, unknown>>)
          .map((section) => ({
            heading: String(section.heading ?? '').trim(),
            body: String(section.body ?? '').trim(),
          }))
          .filter((section) => section.heading && section.body)
      : [];

    if (sections.length === 0) {
      return failure(req, 'The devotional could not be generated. Please try again.', 502);
    }

    const response = {
      reference,
      translation,
      title: String(raw.title ?? '').trim() || 'Today’s Devotional',
      sections,
      reflectionQuestion: String(raw.reflectionQuestion ?? '').trim(),
      prayer: String(raw.prayer ?? '').trim(),
      isPersonalized: personalised,
      relatedScripture: Array.isArray(raw.relatedScripture)
        ? (raw.relatedScripture as Array<Record<string, unknown>>)
            .map((entry) => validateRelated(entry))
            .filter((entry): entry is RelatedReference => entry !== null)
            .slice(0, 3)
        : [],
    };

    if (cacheKey) {
      await writeStudyCache(cacheKey, reference, translation, 'devotional', response);
    }
    return json(req, response);
  } catch (error) {
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'The devotional could not be generated. Please try again.', 502);
  }
});
