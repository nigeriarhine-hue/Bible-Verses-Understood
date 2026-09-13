/**
 * POST /functions/v1/devotional
 *
 * Writes the daily devotional for a passage. When a signed-in reader has chosen
 * topics and left personalisation on, those interests shape the reflection —
 * the interests are the only personal data used.
 *
 * There are two caches, and which one is used decides who can see the result.
 * The general devotional has nothing personal in it and is shared by everyone.
 * A personalised one goes to user_devotional_cache, written and read through
 * the reader's own token so the database refuses it to anybody else. A guest
 * gets the general one: there is nowhere private to keep theirs.
 *
 * Body: { reference, translation, scriptureText, date?, interests?[] }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, hasGeminiKey } from '../_shared/gemini.ts';
import { UnusableResponseError, generateDevotional } from '../_shared/generate.ts';
import { DAILY_LIMIT_CODE, DAILY_LIMIT_MESSAGE } from '../_shared/quotas.ts';
import {
  callerKey,
  callerUserId,
  consumeDailyQuota,
  isRateLimited,
  readStudyCache,
  readUserDevotional,
  studyCacheKey,
  userDevotionalCacheKey,
  writeStudyCache,
  writeUserDevotional,
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

  // Asked of the database, not read out of the token here, so a forged id
  // cannot reach another reader's devotionals.
  const userId = interests.length > 0 ? await callerUserId(req) : null;
  // A guest asking for a personalised devotional gets the general one. There is
  // no private place to keep theirs, and the shared cache is public by design.
  const personalised = Boolean(userId);

  const sharedKey = personalised
    ? null
    : await studyCacheKey(reference, translation, 'devotional', scriptureText);
  const privateKey = userId
    ? await userDevotionalCacheKey(userId, reference, translation, scriptureText, interests)
    : null;

  // Both caches are read before the allowance is touched, so a devotional that
  // already exists is served whatever is left for today.
  if (sharedKey) {
    const cached = await readStudyCache<Record<string, unknown>>(sharedKey);
    if (cached) return json(req, { ...cached, cached: true });
  }
  if (privateKey) {
    const cached = await readUserDevotional<Record<string, unknown>>(req, privateKey);
    if (cached) return json(req, { ...cached, cached: true });
  }

  const quota = await consumeDailyQuota(req, 'devotional');
  if (!quota.allowed) {
    return failure(req, DAILY_LIMIT_MESSAGE, 429, { code: DAILY_LIMIT_CODE });
  }

  try {
    const response = await generateDevotional(
      reference,
      translation,
      scriptureText,
      personalised ? interests : [],
    );

    // Each result goes back to the cache it came from, and only there. The
    // shared one never receives a personalised devotional; the private one is
    // written through the reader's own token, so the database checks the owner
    // rather than trusting the key.
    if (sharedKey) {
      await writeStudyCache(sharedKey, reference, translation, 'devotional', response);
    } else if (privateKey && userId) {
      await writeUserDevotional(req, userId, privateKey, reference, translation, response);
    }
    return json(req, response);
  } catch (error) {
    if (error instanceof UnusableResponseError) {
      return failure(req, `${error.message} Please try again.`, 502);
    }
    if (error instanceof GeminiError) return failure(req, error.message, error.status);
    return failure(req, 'The devotional could not be generated. Please try again.', 502);
  }
});
