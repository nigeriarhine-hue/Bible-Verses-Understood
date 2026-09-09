/**
 * Google Generative Language client.
 *
 * The API key lives only in this runtime — it is set as a Supabase secret and
 * is never sent to, or referenced by, the browser bundle.
 *
 * Output token budgets are not decided here. They come from tokens.ts, which is
 * the single authority, so no caller can reintroduce a small limit of its own.
 */
import {
  ABSOLUTE_MAX_OUTPUT_TOKENS,
  clampOutputTokens,
  MIN_OUTPUT_TOKENS,
  outputCeiling,
  outputTokensFor,
  type OutputBudget,
} from './tokens.ts';

const DEFAULT_MODEL = 'gemini-3.6-flash';
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** What, if anything, is worth trying again after a failure. */
export type RetryHint =
  /** Nothing would come out differently. Report it. */
  | 'none'
  /** The model had no capacity. A different model may. */
  | 'other-model'
  /** The answer was cut off. A larger budget may finish it. */
  | 'more-tokens';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * Which single retry, if any, this failure justifies. Each is taken at most
     * once — a rejected key, a refused permission or a malformed request would
     * fail identically however many times it is sent.
     */
    readonly retry: RetryHint = 'none',
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function hasGeminiKey(): boolean {
  return Boolean(Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY'));
}

interface GenerateOptions {
  system: string;
  prompt: string;
  /** A JSON schema; when given, the model is asked for structured JSON. */
  schema?: Record<string, unknown>;
  temperature?: number;
  /** Which shared budget this request needs. Defaults to 'standard'. */
  budget?: OutputBudget;
  /** An explicit limit, still clamped to the shared ceiling. Rarely needed. */
  maxOutputTokens?: number;
  /** Prior turns, oldest first. */
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

interface GeminiPart {
  text?: string;
  /**
   * Set on a reasoning part. Thinking models return their thought summary as
   * an extra part alongside the answer, so a part like this is commentary
   * about the answer, never the answer itself.
   */
  thought?: boolean;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Reasoning tokens. They count against maxOutputTokens on newer models. */
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  promptFeedback?: { blockReason?: string };
}

/** The envelope the Generative Language API returns on a failure. */
interface GeminiApiError {
  error?: { code?: number; message?: string; status?: string };
}

interface GeminiResult {
  text: string;
  finishReason: string;
  usage: GeminiUsage;
  /** The limit that was asked for, so a truncation can name it. */
  maxOutputTokens: number;
  /** Part counts, so a parse failure can say what the shape of the reply was. */
  partCount: number;
  thoughtPartCount: number;
}

/**
 * What this deployment has learned from the API about its own limits.
 *
 * Both are corrections the API itself supplied, so they are trusted over the
 * configured values and reused for the life of the isolate rather than
 * rediscovered on every request.
 */
let learnedCeiling = 0;
let thinkingConfigRejected = false;

/** Forgets what the API taught us. Tests only. */
export function resetLearnedLimits(): void {
  learnedCeiling = 0;
  thinkingConfigRejected = false;
}

/**
 * The reasoning effort to ask for, when the deployment asks for one at all.
 *
 * Left unset by default, which leaves the model to scale its own reasoning to
 * the question — the behaviour the site runs on today. It is worth setting only
 * to rein in a model that reasons more than a task warrants; the budget is
 * generous enough that reasoning no longer crowds out the answer either way.
 * An unsupported value is dropped rather than allowed to fail every request.
 */
function thinkingLevel(): string {
  if (thinkingConfigRejected) return '';
  const level = Deno.env.get('GEMINI_THINKING_LEVEL')?.trim().toLowerCase() ?? '';
  return level === 'low' || level === 'high' ? level : '';
}

function requestBody(options: GenerateOptions, maxOutputTokens: number): Record<string, unknown> {
  const level = thinkingLevel();
  return {
    contents: [
      ...(options.history ?? []).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: 'user', parts: [{ text: options.prompt }] },
    ],
    systemInstruction: { parts: [{ text: options.system }] },
    generationConfig: {
      temperature: options.temperature ?? 0.6,
      topP: 0.95,
      maxOutputTokens,
      ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
      ...(options.schema
        ? { responseMimeType: 'application/json', responseSchema: options.schema }
        : {}),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
}

/**
 * The largest output limit named in a rejection, when the API is telling us our
 * own was too high. Returns 0 when the message is about something else.
 */
function acceptedCeilingFrom(message: string): number {
  if (!/max_?output_?tokens/i.test(message)) return 0;
  const numbers = [...message.matchAll(/\d[\d,_]*/g)]
    .map((match) => Number(match[0].replace(/[,_]/g, '')))
    .filter((value) => Number.isInteger(value) && value >= MIN_OUTPUT_TOKENS && value <= ABSOLUTE_MAX_OUTPUT_TOKENS);
  return numbers.length ? Math.max(...numbers) : 0;
}

/** True when a rejection is about the thinking configuration we added. */
function rejectsThinkingConfig(message: string): boolean {
  return /thinking(_?level|_?budget|_?config)/i.test(message);
}

/**
 * One HTTP call to one named model, repaired at most once.
 *
 * A 400 that names our own output limit or thinking configuration is the API
 * telling us the request is malformed in a way we can correct, so the
 * correction is remembered and the call is resent — exactly once, so a
 * persistent rejection cannot loop. Everything else is reported as it came.
 */
async function callModel(
  model: string,
  key: string,
  options: GenerateOptions,
  maxOutputTokens: number,
): Promise<GeminiResponse> {
  let budget = learnedCeiling ? Math.min(maxOutputTokens, learnedCeiling) : maxOutputTokens;
  let repaired = false;

  for (;;) {
    const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(requestBody(options, budget)),
    });

    if (res.ok) return (await res.json()) as GeminiResponse;

    const detail = await res.text().catch(() => '');
    let reported = '';
    let message = detail;
    try {
      const parsed = (JSON.parse(detail) as GeminiApiError).error;
      reported = parsed?.status ?? '';
      message = parsed?.message ?? detail;
    } catch {
      // An error body is not always JSON, and the HTTP status still decides.
    }

    if (res.status === 503 || reported === 'UNAVAILABLE') {
      throw new GeminiError(
        `The commentary service is busy right now (${model} is overloaded). ` +
          `Please try again in a moment.`,
        503,
        'other-model',
      );
    }

    // A rejection we can act on, taken once. Beyond that the request is simply
    // invalid and pretending otherwise would spin.
    if (res.status === 400 && !repaired) {
      const accepted = acceptedCeilingFrom(message);
      if (accepted && accepted < budget) {
        learnedCeiling = accepted;
        budget = accepted;
        repaired = true;
        console.warn(
          `${model} refused maxOutputTokens ${maxOutputTokens}; using ${accepted}, ` +
            `which it named as its limit. Set GEMINI_MAX_OUTPUT_TOKENS to ${accepted} to skip this.`,
        );
        continue;
      }
      if (!thinkingConfigRejected && thinkingLevel() && rejectsThinkingConfig(message)) {
        thinkingConfigRejected = true;
        repaired = true;
        console.warn(
          `${model} refused the GEMINI_THINKING_LEVEL setting; sending the request without it. ` +
            `Unset that secret, or use a value this model supports.`,
        );
        continue;
      }
    }

    // Everything else is reported as it came. Google's own wording is what made
    // the retired-model failure diagnosable, so it is kept rather than flattened.
    throw new GeminiError(
      `The commentary service returned ${res.status}. ${detail.slice(0, 400)}`,
      res.status === 429 ? 429 : 502,
    );
  }
}

/** The reader-facing failure when the primary and the fallback both fail. */
function bothModelsFailed(model: string, fallbackModel: string, retryError: unknown): GeminiError {
  if (retryError instanceof GeminiError && retryError.retry !== 'other-model') {
    // The fallback is not usable at all, which is a configuration problem
    // rather than a busy one. Name the secret so it can be corrected.
    return new GeminiError(
      `The commentary service is busy, and the fallback model could not be used. ` +
        `${model} was overloaded, and GEMINI_FALLBACK_MODEL (${fallbackModel}) failed: ` +
        `${retryError.message}`,
      502,
    );
  }
  return new GeminiError(
    `The commentary service is busy right now — both ${model} and ${fallbackModel} are ` +
      `overloaded. Please try again in a moment.`,
    503,
    'other-model',
  );
}

/**
 * One generation at one budget, across the primary model and its fallback.
 *
 * Everything about *why* a response is unusable is decided here, before any
 * caller sees the text.
 */
async function attempt(options: GenerateOptions, maxOutputTokens: number): Promise<GeminiResult> {
  const key = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');
  if (!key) {
    throw new GeminiError(
      'The commentary service is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY as a Supabase secret.',
      503,
    );
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;
  const fallbackModel = Deno.env.get('GEMINI_FALLBACK_MODEL')?.trim() ?? '';

  let payload: GeminiResponse;
  try {
    payload = await callModel(model, key, options, maxOutputTokens);
  } catch (error) {
    // One retry, on a different model, for an overloaded model only. Anything
    // else is a property of the request or the key rather than of capacity, so
    // repeating it elsewhere would just fail twice and cost twice.
    if (
      !(error instanceof GeminiError) ||
      error.retry !== 'other-model' ||
      !fallbackModel ||
      fallbackModel === model
    ) {
      throw error;
    }
    // Model names are configuration, not secrets. The key is never logged.
    console.warn(`Gemini model ${model} is overloaded — retrying once on ${fallbackModel}.`);
    try {
      payload = await callModel(fallbackModel, key, options, maxOutputTokens);
    } catch (retryError) {
      throw bothModelsFailed(model, fallbackModel, retryError);
    }
  }

  const usage = payload.usageMetadata ?? {};
  const candidate = payload.candidates?.[0];
  const finishReason = candidate?.finishReason ?? '';
  const parts = candidate?.content?.parts ?? [];
  // A thought part is prose about the answer, not the answer. Joining it with
  // the answer yields reasoning wrapped around the JSON, and if that reasoning
  // contains a brace the salvage window below starts in the wrong place and the
  // whole reply reads as malformed. Only answer parts are the response; nothing
  // is discarded quietly, because the counts are logged if a parse still fails.
  const answerParts = parts.filter((part) => part.thought !== true);
  const thoughtPartCount = parts.length - answerParts.length;
  const text = answerParts.map((part) => part.text ?? '').join('');

  // A prompt rejected outright never produces a candidate at all.
  if (payload.promptFeedback?.blockReason) {
    throw new GeminiError(
      `The request was refused by the safety filters (${payload.promptFeedback.blockReason}).`,
      502,
    );
  }

  // Check why generation stopped BEFORE anyone tries to parse the text. A
  // truncated response is not malformed output — it is incomplete output, and
  // saying so is the difference between a fixable report and a mystery.
  if (finishReason === 'MAX_TOKENS') {
    const produced = usage.candidatesTokenCount ?? 0;
    const thoughts = usage.thoughtsTokenCount ?? 0;
    throw new GeminiError(
      `The commentary service ran out of output tokens before finishing. ` +
        `The limit for this request was ${maxOutputTokens}; the model used ` +
        `${produced} output token(s)` +
        (thoughts ? ` and ${thoughts} reasoning token(s), which also count against the limit` : '') +
        `. Please try again, or ask for a shorter answer.`,
      502,
      'more-tokens',
    );
  }
  if (finishReason && finishReason !== 'STOP') {
    throw new GeminiError(
      `The commentary service stopped early (${finishReason}) and returned an incomplete response.`,
      502,
    );
  }

  if (!text.trim()) {
    throw new GeminiError(
      `The commentary service returned an empty response${finishReason ? ` (${finishReason})` : ''}.`,
      502,
    );
  }

  const result: GeminiResult = {
    text,
    finishReason,
    usage,
    maxOutputTokens,
    partCount: parts.length,
    thoughtPartCount,
  };
  logUsage(model, result);
  return result;
}

/**
 * One safe line per successful request, when GEMINI_LOG_USAGE is set.
 *
 * Off by default so the function logs stay readable; worth turning on to
 * confirm what limit a deployment is really sending, and how much of it the
 * reasoning is taking. Counts and configuration only — never the key, the
 * headers, the prompt, or anything the reader wrote or received.
 */
function logUsage(model: string, result: GeminiResult): void {
  if (!Deno.env.get('GEMINI_LOG_USAGE')?.trim()) return;
  const { usage, finishReason, maxOutputTokens } = result;
  console.log(
    'Gemini usage:',
    JSON.stringify({
      model,
      maxOutputTokens,
      ceiling: outputCeiling(),
      finishReason,
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      thoughtsTokenCount: usage.thoughtsTokenCount,
      totalTokenCount: usage.totalTokenCount,
    }),
  );
}

/**
 * Calls Gemini, escalating once if the answer was cut short.
 *
 * The escalation goes straight to the ceiling rather than climbing, so there is
 * one retry and only one. A request that started at the ceiling has nowhere to
 * go and reports the truncation instead.
 */
async function generateRaw(options: GenerateOptions): Promise<GeminiResult> {
  const ceiling = outputCeiling();
  const first =
    options.maxOutputTokens === undefined
      ? outputTokensFor(options.budget ?? 'standard')
      : clampOutputTokens(options.maxOutputTokens);

  try {
    return await attempt(options, first);
  } catch (error) {
    if (!(error instanceof GeminiError) || error.retry !== 'more-tokens' || first >= ceiling) {
      throw error;
    }
    console.warn(
      `Gemini ran out of output tokens at ${first} — retrying once at the ceiling of ${ceiling}.`,
    );
    return await attempt(options, ceiling);
  }
}

/** Calls Gemini and returns the raw text of the first candidate. */
export async function generateText(options: GenerateOptions): Promise<string> {
  return (await generateRaw(options)).text;
}

/** Calls Gemini expecting JSON, and parses it defensively. */
export async function generateJson<T>(options: GenerateOptions & { schema: Record<string, unknown> }): Promise<T> {
  const result = await generateRaw(options);
  try {
    return parseJson<T>(result.text);
  } catch (error) {
    // Only reached when the model stopped normally and still produced
    // unparseable output — truncation was ruled out above. Record enough to
    // diagnose it and nothing more: no key, no headers, no prompt, no reader
    // input. The excerpts are of the model's own output, capped and only
    // written when a request has already failed.
    logParseFailure(result);
    throw error;
  }
}

/** Safe diagnostics for a response that stopped cleanly but would not parse. */
function logParseFailure(result: GeminiResult): void {
  const { text, finishReason, usage, maxOutputTokens, partCount, thoughtPartCount } = result;
  const excerpt = (value: string) => value.replace(/\s+/g, ' ').trim();
  console.error(
    'Gemini response did not parse as JSON:',
    JSON.stringify({
      model: Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL,
      finishReason: finishReason || '(none reported)',
      textLength: text.length,
      maxOutputTokens,
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      thoughtsTokenCount: usage.thoughtsTokenCount,
      partCount,
      thoughtPartCount,
      head: excerpt(text.slice(0, 300)),
      tail: excerpt(text.slice(-300)),
    }),
  );
}

/**
 * Parses model output that should be JSON, tolerating stray fences.
 *
 * The fallback exists for a model that wraps its JSON in prose. It never
 * accepts a partial object quietly: any slice it takes has to parse on its own
 * terms, and a failure there is reported rather than swallowed.
 */
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        // Previously this threw a bare SyntaxError that escaped as a generic
        // failure; report it as what it is.
        throw new GeminiError('The commentary service returned malformed JSON.', 502);
      }
    }
    throw new GeminiError(
      trimmed.includes('{')
        ? 'The commentary service returned an incomplete JSON object.'
        : 'The commentary service returned malformed JSON.',
      502,
    );
  }
}
