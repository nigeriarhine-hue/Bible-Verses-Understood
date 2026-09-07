/**
 * Shared study cache and small helpers.
 *
 * The cache holds generated commentary keyed by reference, translation, mode,
 * prompt version and a digest of the Scripture text it was written about. It
 * contains no user data, so it can be read by anyone and is written with the
 * service role.
 */
import { PROMPT_VERSION } from './prompts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export function cachingEnabled(): boolean {
  return Boolean(SUPABASE_URL && (SERVICE_ROLE_KEY || ANON_KEY));
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The Scripture digest is part of the key so a caller cannot poison the shared
 * cache entry for a reference by sending different text under its name.
 */
export async function studyCacheKey(
  reference: string,
  translation: string,
  mode: string,
  scriptureText: string,
): Promise<string> {
  const textDigest = await sha256(scriptureText);
  return sha256([reference, translation, mode, PROMPT_VERSION, textDigest].join('|'));
}

export async function readStudyCache<T>(cacheKey: string): Promise<T | null> {
  if (!cachingEnabled()) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/study_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=study_data&limit=1`,
      {
        headers: {
          apikey: ANON_KEY || SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY || ANON_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ study_data: T }>;
    return rows[0]?.study_data ?? null;
  } catch {
    return null;
  }
}

export async function writeStudyCache(
  cacheKey: string,
  reference: string,
  translation: string,
  mode: string,
  studyData: unknown,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/study_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        reference,
        translation,
        explanation_mode: mode,
        prompt_version: PROMPT_VERSION,
        study_data: studyData,
      }),
    });
  } catch {
    // Caching is an optimisation; never fail a study because of it.
  }
}

/* -------------------------------------------------------------------------- */
/* Very small in-memory rate limiter                                          */
/* -------------------------------------------------------------------------- */

const hits = new Map<string, number[]>();

/** Returns true when the caller is over the limit for this window. */
export function isRateLimited(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > limit;
}

export function callerKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'
  );
}
