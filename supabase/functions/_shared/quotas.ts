/**
 * How many Gemini generations a caller may cause in a day.
 *
 * One place, like tokens.ts, so a limit cannot drift per endpoint. These count
 * *generations*, not requests: a cache hit costs nothing and is never charged,
 * so the numbers are about new AI content and not about how much of the site
 * someone reads.
 *
 * Every limit can be overridden with a secret, so a limit can be adjusted
 * without a code change. An unusable value falls back to the default rather
 * than leaving an endpoint unlimited or unusable.
 */

export type QuotaEndpoint = 'study' | 'devotional' | 'situation';

export interface DailyQuota {
  /** A visitor without an account, identified by a hash of their address. */
  guest: number;
  /** A signed-in reader, identified by the id in their verified token. */
  user: number;
}

/**
 * Life-situation guidance is the expensive one: it is never cached, because it
 * is written about what somebody said about their life. The other two are
 * cached and shared, so their limits only ever bite on genuinely new passages.
 */
const DEFAULTS: Record<QuotaEndpoint, DailyQuota> = {
  study: { guest: 20, user: 50 },
  devotional: { guest: 5, user: 15 },
  situation: { guest: 2, user: 5 },
};

/** A limit below this would make a feature look broken rather than capped. */
const MAX_SANE_LIMIT = 10_000;

let warned = false;

function override(endpoint: QuotaEndpoint, who: 'GUEST' | 'USER', fallback: number): number {
  const raw = Deno.env.get(`AI_DAILY_LIMIT_${endpoint.toUpperCase()}_${who}`)?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_SANE_LIMIT) {
    if (!warned) {
      warned = true;
      console.warn(
        `AI_DAILY_LIMIT_${endpoint.toUpperCase()}_${who} is not a whole number between 0 and ` +
          `${MAX_SANE_LIMIT}; using the default of ${fallback}.`,
      );
    }
    return fallback;
  }
  return value;
}

export function dailyQuota(endpoint: QuotaEndpoint): DailyQuota {
  const defaults = DEFAULTS[endpoint];
  return {
    guest: override(endpoint, 'GUEST', defaults.guest),
    user: override(endpoint, 'USER', defaults.user),
  };
}

/** Resets the once-per-isolate warning. Tests only. */
export function resetQuotaWarnings(): void {
  warned = false;
}

/**
 * What a reader is told when the day's allowance is gone.
 *
 * It names what still works, because almost all of the site does: Scripture is
 * served from bundled text and from the Bible providers, and every explanation
 * and devotional already written is served from the cache without Gemini.
 */
export const DAILY_LIMIT_MESSAGE =
  "Today's AI guidance limit has been reached. Bible reading and previously " +
  'prepared explanations remain available.';

export const DAILY_LIMIT_CODE = 'daily_limit_reached';
