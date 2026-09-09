/**
 * POST /functions/v1/followup
 *
 * Answers a reader's question about the passage they are studying, keeping the
 * verse, translation and explanation mode in context.
 *
 * Body: { reference, translation, mode?, question, scriptureText, history? }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, generateJson, hasGeminiKey } from '../_shared/gemini.ts';
import { validateRelated, type RelatedReference } from '../_shared/books.ts';
import {
  FOLLOWUP_SCHEMA,
  GUARDRAILS,
  RELATED_SCRIPTURE_INSTRUCTION,
  VOICE,
  scriptureBlock,
} from '../_shared/prompts.ts';
import { callerKey, isRateLimited } from '../_shared/store.ts';

const MAX_QUESTION_CHARS = 800;
const MAX_HISTORY_TURNS = 12;
const MAX_SCRIPTURE_CHARS = 20_000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);

  if (isRateLimited(`followup:${callerKey(req)}`, 30)) {
    return failure(req, 'Too many questions at once. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  const reference = String(body.reference ?? '').trim();
  const translation = String(body.translation ?? '').trim().toUpperCase();
  const question = String(body.question ?? '').trim();
  const scriptureText = String(body.scriptureText ?? '').trim();
  const mode = String(body.mode ?? 'simple').trim();

  if (!reference) return failure(req, 'A Bible reference is required.');
  if (!question) return failure(req, 'A question is required.');
  if (question.length > MAX_QUESTION_CHARS) {
    return failure(req, 'That question is a little long — could you shorten it?');
  }
  if (!scriptureText) return failure(req, 'The Scripture text for this passage is required.');
  if (scriptureText.length > MAX_SCRIPTURE_CHARS) {
    return failure(req, 'That passage is too long for one request. Try a shorter range.');
  }
  if (!hasGeminiKey()) {
    return failure(req, 'Follow-up questions are not available: the commentary service is not configured.', 503, {
      code: 'commentary_not_configured',
    });
  }

  const history = Array.isArray(body.history)
    ? (body.history as Array<Record<string, unknown>>)
        .slice(-MAX_HISTORY_TURNS)
        .map((turn) => ({
          role: String(turn.role) === 'assistant' ? ('model' as const) : ('user' as const),
          text: String(turn.content ?? '').slice(0, 4000),
        }))
        .filter((turn) => turn.text)
    : [];

  const system = [
    'You are answering a reader\'s follow-up question inside Bible Verses',
    `Understood. They are studying ${reference} and reading the ${mode} explanation.`,
    '',
    VOICE,
    '',
    GUARDRAILS,
    '',
    'Answer the question directly in 2-5 short paragraphs. Stay anchored to the',
    'passage in front of them; if the question moves away from it, answer',
    'briefly and point back to Scripture that speaks to it. If the question',
    'cannot be answered from Scripture or responsible scholarship, say so',
    'plainly rather than speculating.',
    '',
    RELATED_SCRIPTURE_INSTRUCTION,
    'Return 0-4 related passages — an empty list is fine if none genuinely apply.',
    'Also suggest 2-3 natural next questions the reader might ask.',
    '',
    'Return JSON matching the schema. The answer is plain prose: blank lines',
    'between paragraphs, no Markdown headings, bullets, bold or italics.',
  ].join('\n');

  const prompt = [
    scriptureBlock(reference, translation, scriptureText),
    '',
    `The reader asks: ${question}`,
  ].join('\n');

  try {
    const raw = await generateJson<Record<string, unknown>>({
      system,
      prompt,
      schema: FOLLOWUP_SCHEMA,
      history,
      temperature: 0.6,
      // A follow-up carries the prior turns as well as its own answer, related
      // Scripture and the reasoning to get there, so it takes the long budget.
      budget: 'long',
    });

    const answer = String(raw.answer ?? '').trim();
    if (!answer) {
      return failure(req, 'The commentary service returned an empty answer. Please try again.', 502);
    }

    const relatedScripture = Array.isArray(raw.relatedScripture)
      ? (raw.relatedScripture as Array<Record<string, unknown>>)
          .map((entry) => validateRelated(entry))
          .filter((entry): entry is RelatedReference => entry !== null)
          .slice(0, 4)
      : [];

    const suggestedQuestions = Array.isArray(raw.suggestedQuestions)
      ? (raw.suggestedQuestions as unknown[])
          .map((entry) => String(entry ?? '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    return json(req, { answer, relatedScripture, suggestedQuestions });
  } catch (error) {
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'That question could not be answered right now. Please try again.', 502);
  }
});
