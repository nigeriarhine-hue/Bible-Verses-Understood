import { cacheGet, cacheSet, DAY, HOUR } from '../cache';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, isCommentaryConfigured } from '../env';
import { supabase } from '../supabase';
import {
  CommentaryError,
  type Devotional,
  type ExplanationMode,
  type FollowUpAnswer,
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
    let code: 'not_configured' | 'rate_limited' | 'failed' = 'failed';
    try {
      const payload = (await res.json()) as { error?: string; code?: string };
      if (payload.error) message = payload.error;
      if (payload.code === 'commentary_not_configured') code = 'not_configured';
    } catch {
      /* keep the default message */
    }
    if (res.status === 429) code = 'rate_limited';
    if (res.status === 503 && code !== 'not_configured') code = 'not_configured';
    throw new CommentaryError(message, code);
  }

  return (await res.json()) as T;
}

export function studyCacheKey(reference: string, translation: string, mode: ExplanationMode): string {
  return `bvu:study:${mode}:${translation}:${reference}`;
}

/** Reads a study from the local cache without touching the network. */
export function getCachedStudy(
  reference: string,
  translation: string,
  mode: ExplanationMode,
): Study | null {
  return cacheGet<Study>(studyCacheKey(reference, translation, mode));
}

export async function getStudy(
  reference: string,
  translation: string,
  mode: ExplanationMode,
  scriptureText: string,
): Promise<Study> {
  const key = studyCacheKey(reference, translation, mode);
  const cached = cacheGet<Study>(key);
  if (cached) return cached;

  const study = await callFunction<Study>('study', { reference, translation, mode, scriptureText });
  cacheSet(key, study, STUDY_TTL);
  return study;
}

export async function askFollowUp(input: {
  reference: string;
  translation: string;
  mode: ExplanationMode;
  question: string;
  scriptureText: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<FollowUpAnswer> {
  // Deliberately not cached: a question is personal to the reader who asked it.
  return callFunction<FollowUpAnswer>('followup', input);
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
