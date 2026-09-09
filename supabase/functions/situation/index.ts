/**
 * POST /functions/v1/situation
 *
 * Life-situation search: "I'm scared about losing my job", "I'm grieving".
 * Chooses a passage that genuinely speaks to what the reader described and
 * explains how it may apply — without predicting their future.
 *
 * The reader's words are used for this request only. They are never sent to
 * analytics and are not written to the shared cache.
 *
 * Body: { situation, translation }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, generateJson, hasGeminiKey } from '../_shared/gemini.ts';
import { validateRelated, type RelatedReference } from '../_shared/books.ts';
import {
  GUARDRAILS,
  RELATED_SCRIPTURE_INSTRUCTION,
  SITUATION_SCHEMA,
  VOICE,
} from '../_shared/prompts.ts';
import { callerKey, isRateLimited } from '../_shared/store.ts';

const MAX_SITUATION_CHARS = 1200;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);

  if (isRateLimited(`situation:${callerKey(req)}`, 20)) {
    return failure(req, 'Too many requests. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  const situation = String(body.situation ?? '').trim();
  const translation = String(body.translation ?? 'KJV').trim().toUpperCase();

  if (!situation) return failure(req, 'Tell us what you are facing.');
  if (situation.length > MAX_SITUATION_CHARS) {
    return failure(req, 'That is a little long — try describing it in a few sentences.');
  }
  if (!hasGeminiKey()) {
    return failure(req, 'This search is not available: the commentary service is not configured.', 503, {
      code: 'commentary_not_configured',
    });
  }

  const system = [
    'A reader has described something they are facing, or asked what the Bible',
    'says about a subject. Choose one passage that genuinely speaks to it and',
    'help them understand and apply it.',
    '',
    VOICE,
    '',
    GUARDRAILS,
    '',
    'Additional care for this kind of request:',
    '- Acknowledge what they described plainly and without dramatising it.',
    '- Do not tell them what God is doing in their situation, what will happen,',
    '  or what decision to make. Offer principles and possibilities.',
    '- If what they describe suggests danger to themselves or someone else,',
    '  abuse, or a mental-health crisis, gently and specifically encourage them',
    '  to reach out to someone they trust and to a qualified professional or a',
    '  local crisis line, and keep the Scripture comforting rather than',
    '  instructional.',
    '',
    'Use these headings, in this order, skipping none:',
    '"What You\'re Facing", "What the Passage Means", "How It May Apply",',
    '"Something to Consider", "A Practical Next Step".',
    'Then a short optional prayer. Around 500-700 words in total.',
    '',
    'For primaryReference, give the passage the sections are about — book name',
    'as it appears in a standard Protestant Bible, chapter, starting verse, and',
    'ending verse (or null). Choose a short passage, not a whole chapter, where',
    'you can.',
    '',
    RELATED_SCRIPTURE_INSTRUCTION,
    'Return 3-5 related passages.',
    '',
    'Return JSON matching the schema. Section bodies are plain prose with no',
    'Markdown formatting.',
  ].join('\n');

  try {
    const raw = await generateJson<Record<string, unknown>>({
      system,
      prompt: `The reader wrote: """${situation}"""\n\nThey are reading in the ${translation} translation.`,
      schema: SITUATION_SCHEMA,
      temperature: 0.6,
      // Several sections plus the passage that fits the reader's situation.
      budget: 'long',
    });

    const primary = validateRelated((raw.primaryReference ?? {}) as Record<string, unknown>);
    if (!primary) {
      return failure(req, 'A suitable passage could not be identified. Please try rewording that.', 502);
    }

    const sections = Array.isArray(raw.sections)
      ? (raw.sections as Array<Record<string, unknown>>)
          .map((section) => ({
            heading: String(section.heading ?? '').trim(),
            body: String(section.body ?? '').trim(),
          }))
          .filter((section) => section.heading && section.body)
      : [];

    if (sections.length === 0) {
      return failure(req, 'A response could not be generated. Please try again.', 502);
    }

    return json(req, {
      situationSummary: String(raw.situationSummary ?? '').trim(),
      primaryReference: primary,
      sections,
      prayer: String(raw.prayer ?? '').trim() || null,
      relatedScripture: Array.isArray(raw.relatedScripture)
        ? (raw.relatedScripture as Array<Record<string, unknown>>)
            .map((entry) => validateRelated(entry))
            .filter((entry): entry is RelatedReference => entry !== null)
            .filter((entry) => entry.reference !== primary.reference)
            .slice(0, 5)
        : [],
    });
  } catch (error) {
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'A response could not be generated right now. Please try again.', 502);
  }
});
