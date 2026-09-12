import { cacheGet, cacheSet, DAY, HOUR } from '../cache';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, isCommentaryConfigured } from '../env';
import { supabase } from '../supabase';
import {
  CommentaryError,
  EXPLANATION_MODE,
  type CommentaryErrorCode,
  type Devotional,
  type SituationGuidance,
  type Study,
} from './types';

/**
 * Client for the commentary Edge Functions.
 *
 * Explanations are cached locally by reference, translation and mode so
 * switching back and forth between modes, or returning to a passage from the
 * study trail, does not regenerate anything.
 */

const STUDY_TTL = DAY * 14;

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isCommentaryConfigured) {
    throw new CommentaryError(
      'Explanations are not available in this deployment yet.',
      'not_configured',
    );
  }

  // Pass the reader's token when they have one, so the function can apply
  // per-account limits. Guests call with the public anon key.
  let authToken = SUPABASE_ANON_KEY;
  try {
    const session = await supabase?.auth.getSession();
    if (session?.data.session?.access_token) authToken = session.data.session.access_token;
  } catch {
    /* not signed in */
  }

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CommentaryError('Could not reach the commentary service. Check your connection.', 'failed');
  }

  if (!res.ok) {
    let message = `The commentary service returned ${res.status}.`;
    let code: CommentaryErrorCode = 'failed';
    try {
      const payload = (await res.json()) as { error?: string; code?: string };
      if (payload.error) message = payload.error;
      if (payload.code === 'commentary_not_configured') code = 'not_configured';
      // The day's allowance, not a burst: the function says which it is, and
      // only one of the two is worth offering a retry for.
      if (payload.code === 'daily_limit_reached') code = 'daily_limit';
    } catch {
      /* keep the default message */
    }
    if (res.status === 429 && code !== 'daily_limit') code = 'rate_limited';
    // 503 is not on its own a sign of a missing key: an overloaded model
    // answers with one too, and that is worth a retry. Every function that
    // really is unconfigured says so with the code above, so trust that alone —
    // otherwise a busy model hides the "Try again" button behind
    // "Explanations are not switched on yet".
    throw new CommentaryError(message, code);
  }

  return (await res.json()) as T;
}

/**
 * The `v2` is the format, not the passage.
 *
 * Explanations written before the 300-word rewrite are still sitting in
 * readers' browsers under the old key and would otherwise be shown for another
 * fortnight. The server-side cache is versioned the same way, by PROMPT_VERSION
 * inside its key, so neither tier serves the old long format.
 */
export function studyCacheKey(reference: string, translation: string): string {
  return `bvu:study:v2:${EXPLANATION_MODE}:${translation}:${reference}`;
}

/** Reads a study from the local cache without touching the network. */
export function getCachedStudy(reference: string, translation: string): Study | null {
  return cacheGet<Study>(studyCacheKey(reference, translation));
}

/**
 * The Simple Explanation for a passage.
 *
 * Three tiers stand between a reader and a billable request: this browser's
 * cache, then the shared study_cache in Postgres that every reader benefits
 * from, then Gemini. Only the third costs anything.
 */
export async function getStudy(
  reference: string,
  translation: string,
  scriptureText: string,
): Promise<Study> {
  const key = studyCacheKey(reference, translation);
  const cached = cacheGet<Study>(key);
  if (cached) return cached;

  const study = await callFunction<Study>('study', {
    reference,
    translation,
    mode: EXPLANATION_MODE,
    scriptureText,
  });
  cacheSet(key, study, STUDY_TTL);
  return study;
}

export async function getDevotional(input: {
  reference: string;
  translation: string;
  scriptureText: string;
  interests?: string[];
}): Promise<Devotional> {
  const personalised = (input.interests?.length ?? 0) > 0;
  const key = `bvu:devotional:${input.translation}:${input.reference}${personalised ? ':p' : ''}`;
  const cached = cacheGet<Devotional>(key);
  if (cached) return cached;

  const devotional = await callFunction<Devotional>('devotional', input);
  cacheSet(key, devotional, HOUR * 20);
  return devotional;
}

export async function searchLifeSituation(
  situation: string,
  translation: string,
): Promise<SituationGuidance> {
  // Never cached in shared storage — this is what someone said about their life.
  return callFunction<SituationGuidance>('situation', { situation, translation });
}

export { CommentaryError };
