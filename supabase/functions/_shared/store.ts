/**
 * Shared study cache and small helpers.
 *
 * The cache holds generated commentary keyed by reference, translation, mode,
 * prompt version and a digest of the Scripture text it was written about. It
 * contains no user data, so it can be read by anyone and is written with the
 * service role.
 */
import { PROMPT_VERSION } from './prompts.ts';
import { dailyQuota, type QuotaEndpoint } from './quotas.ts';

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
/* Service-role access, for tables no reader may touch directly               */
/* -------------------------------------------------------------------------- */

/**
 * A PostgREST request made as the service role.
 *
 * Only for tables where the row-level policies deliberately grant nobody
 * access — the send log, the run log, and the subscription rows a guest
 * manages through a token rather than a session. Everything a signed-in reader
 * owns goes through their own credentials instead, so RLS stays the thing
 * enforcing privacy.
 *
 * Returns null when the project is not configured, so a caller can tell
 * "unavailable" from "the request failed".
 */
export async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    return null;
  }
}

/** The rows a service-role read returned, or an empty list. */
export async function serviceRows<T>(path: string): Promise<T[]> {
  const res = await serviceFetch(path);
  if (!res?.ok) return [];
  try {
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Who the caller is, and what they have left for today                       */
/* -------------------------------------------------------------------------- */

/**
 * The caller's own credentials, forwarded to PostgREST unchanged.
 *
 * The point is that this function never decides who anybody is. It hands the
 * token to the database, which verifies it against the project secret. A
 * request carrying a made-up user id gets nothing.
 */
function callerHeaders(req: Request): Record<string, string> | null {
  const authorization = req.headers.get('authorization');
  if (!SUPABASE_URL || !ANON_KEY || !authorization) return null;
  return {
    apikey: ANON_KEY,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
}

/**
 * The signed-in reader behind this request, or null for a guest.
 *
 * Asked of the database rather than read out of the token here, so a forged
 * `sub` cannot get a private devotional or somebody else's allowance.
 */
export async function callerUserId(req: Request): Promise<string | null> {
  const headers = callerHeaders(req);
  if (!headers) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ai_identity`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!res.ok) return null;
    const id = (await res.json()) as string | null;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export interface QuotaVerdict {
  allowed: boolean;
  used: number;
  quota: number;
  signedIn: boolean;
  /** True when there is no database to count against, so nothing was charged. */
  unenforced: boolean;
}

/**
 * Takes one generation from today's allowance, before Gemini is called.
 *
 * Counting happens in a single statement inside the database, so two requests
 * arriving together cannot both take the last one — and it is the same count
 * whichever instance serves them, which the previous in-memory limiter could
 * not manage across a cold start, let alone across instances.
 *
 * If the project is configured and the call fails, this refuses. That is the
 * cautious way round: a database that cannot answer is also a database that
 * cannot serve the cache, so every request behind it would be a fresh
 * generation — exactly when an uncounted endpoint costs the most.
 */
export async function consumeDailyQuota(
  req: Request,
  endpoint: QuotaEndpoint,
): Promise<QuotaVerdict> {
  const limits = dailyQuota(endpoint);
  const headers = callerHeaders(req);
  if (!headers) {
    // Nothing to count against — a local run without Supabase settings.
    return { allowed: true, used: 0, quota: limits.guest, signedIn: false, unenforced: true };
  }

  // The address never leaves this function in the clear.
  const guestKey = await sha256(callerKey(req));

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_endpoint: endpoint,
        p_guest_key: guestKey,
        p_guest_limit: limits.guest,
        p_user_limit: limits.user,
      }),
    });
    if (!res.ok) {
      console.error(`The daily quota check for ${endpoint} returned ${res.status}; refusing.`);
      return { allowed: false, used: 0, quota: limits.guest, signedIn: false, unenforced: false };
    }
    const rows = (await res.json()) as Array<{
      allowed: boolean;
      used: number;
      quota: number;
      signed_in: boolean;
    }>;
    const row = rows[0];
    if (!row) {
      console.error(`The daily quota check for ${endpoint} returned no verdict; refusing.`);
      return { allowed: false, used: 0, quota: limits.guest, signedIn: false, unenforced: false };
    }
    return {
      allowed: row.allowed === true,
      used: row.used ?? 0,
      quota: row.quota ?? 0,
      signedIn: row.signed_in === true,
      unenforced: false,
    };
  } catch (error) {
    console.error(
      `The daily quota check for ${endpoint} could not be made; refusing.`,
      error instanceof Error ? error.name : 'unknown error',
    );
    return { allowed: false, used: 0, quota: limits.guest, signedIn: false, unenforced: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Private per-reader devotional cache                                        */
/* -------------------------------------------------------------------------- */

/**
 * The identity of one reader's personalised devotional.
 *
 * The reader's id is inside the digest as well as in its own column, so two
 * readers who chose the same interests for the same passage still get separate
 * rows — and the policies on the table mean neither could read the other's
 * even if that were not true.
 */
export async function userDevotionalCacheKey(
  userId: string,
  reference: string,
  translation: string,
  scriptureText: string,
  interests: string[],
): Promise<string> {
  const textDigest = await sha256(scriptureText);
  // Order and case must not change the identity; the set of interests is what
  // matters, and changing that set has to produce a different devotional.
  const shape = [...new Set(interests.map((i) => i.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join(',');
  return sha256([userId, reference, translation, PROMPT_VERSION, textDigest, shape].join('|'));
}

/**
 * Reads and writes go through the reader's own token, never the service role.
 *
 * That is deliberate: it means row-level security is what enforces privacy,
 * not the correctness of the key above. A mistake in the key cannot leak a
 * devotional, because the database will not return another reader's row to
 * this token at all.
 */
export async function readUserDevotional<T>(req: Request, cacheKey: string): Promise<T | null> {
  const headers = callerHeaders(req);
  if (!headers) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_devotional_cache?cache_key=eq.${encodeURIComponent(cacheKey)}` +
        '&select=devotional_data&limit=1',
      { headers },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ devotional_data: T }>;
    return rows[0]?.devotional_data ?? null;
  } catch {
    return null;
  }
}

export async function writeUserDevotional(
  req: Request,
  userId: string,
  cacheKey: string,
  reference: string,
  translation: string,
  devotionalData: unknown,
): Promise<void> {
  const headers = callerHeaders(req);
  if (!headers) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/user_devotional_cache?on_conflict=user_id,cache_key`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        cache_key: cacheKey,
        reference,
        translation,
        prompt_version: PROMPT_VERSION,
        devotional_data: devotionalData,
      }),
    });
  } catch {
    // Caching is an optimisation; never fail a devotional because of it.
  }
}

/* -------------------------------------------------------------------------- */
/* Very small in-memory burst limiter                                         */
/*                                                                            */
/* Not the cost control — that is consumeDailyQuota above, which counts in the */
/* database. This only absorbs an obvious flood before it reaches Postgres,    */
/* and forgets everything on a cold start, which is exactly why it cannot be   */
/* trusted with anything that costs money.                                    */
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
