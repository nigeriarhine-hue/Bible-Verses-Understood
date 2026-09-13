/**
 * POST /functions/v1/study
 *
 * Writes the Simple Explanation for a passage that the caller has already
 * retrieved from a Bible source. This function never supplies Bible text — it
 * only comments on the text it is given.
 *
 * Simple is the only explanation this endpoint generates. Deep and Scholar are
 * refused here, before Gemini is called, rather than only hidden in the UI: a
 * direct POST asking for one is a billable request otherwise.
 *
 * Body: { reference, translation, mode?, scriptureText }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, hasGeminiKey } from '../_shared/gemini.ts';
import {
  GENERATED_MODE,
  UnusableResponseError,
  generateSimpleStudy,
  type StudyResponse,
} from '../_shared/generate.ts';
import { DAILY_LIMIT_CODE, DAILY_LIMIT_MESSAGE } from '../_shared/quotas.ts';
import {
  callerKey,
  consumeDailyQuota,
  isRateLimited,
  readStudyCache,
  studyCacheKey,
  writeStudyCache,
} from '../_shared/store.ts';

/** Modes that existed before and are now retired, named so the refusal is clear. */
const RETIRED_MODES: string[] = ['deep', 'scholar'];
// Comfortably above the Bible's longest chapter (Psalm 119, ~13,200
// characters in the KJV), so any real passage can be studied whole.
const MAX_SCRIPTURE_CHARS = 20_000;

/**
 * How long a request took and whether it cost anything.
 *
 * Counts and durations only — no reference, no Scripture, no reader, nothing
 * anybody typed. Enough to tell a slow cache from a slow model, which is the
 * only question these logs exist to answer.
 */
function logTiming(outcome: 'hit' | 'generated' | 'refused', ms: number): void {
  console.log('study:', JSON.stringify({ outcome, ms }));
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
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
  const mode = String(body.mode ?? GENERATED_MODE).toLowerCase();
  const scriptureText = String(body.scriptureText ?? '').trim();

  if (!reference) return failure(req, 'A Bible reference is required.');
  if (!translation) return failure(req, 'A translation is required.');
  // Refused here, above every other check and long before Gemini, so a direct
  // request for a retired mode cannot cost anything.
  if (mode !== GENERATED_MODE) {
    return failure(
      req,
      RETIRED_MODES.includes(mode)
        ? `The ${mode} explanation is no longer available. Request the simple explanation instead.`
        : `Unknown explanation mode: ${mode}. Only the simple explanation is available.`,
      400,
      { code: 'mode_unavailable' },
    );
  }
  if (!scriptureText) return failure(req, 'The Scripture text for this passage is required.');
  if (scriptureText.length > MAX_SCRIPTURE_CHARS) {
    return failure(req, 'That passage to study is too long for one request. Try a shorter range.');
  }

  // The cache is the first thing that happens after the request is understood
  // — before the key is checked, before the allowance is touched. An
  // explanation that already exists is the fastest and cheapest answer this
  // function can give, and nothing should stand in front of it.
  const cacheKey = await studyCacheKey(reference, translation, mode, scriptureText);
  const cached = await readStudyCache<StudyResponse>(cacheKey);
  if (cached) {
    logTiming('hit', Date.now() - startedAt);
    return json(req, { ...cached, cached: true });
  }

  // Only a miss needs any of this.
  if (!hasGeminiKey()) {
    return failure(
      req,
      'Explanations are not available yet: the commentary service has not been configured for this deployment.',
      503,
      { code: 'commentary_not_configured' },
    );
  }

  const quota = await consumeDailyQuota(req, 'study');
  if (!quota.allowed) {
    logTiming('refused', Date.now() - startedAt);
    return failure(req, DAILY_LIMIT_MESSAGE, 429, { code: DAILY_LIMIT_CODE });
  }

  try {
    const response = await generateSimpleStudy(reference, translation, scriptureText);
    await writeStudyCache(cacheKey, reference, translation, GENERATED_MODE, response);
    logTiming('generated', Date.now() - startedAt);
    return json(req, response);
  } catch (error) {
    if (error instanceof UnusableResponseError) {
      return failure(req, `${error.message} Please try again.`, 502);
    }
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'The explanation could not be generated. Please try again.', 502);
  }
});
