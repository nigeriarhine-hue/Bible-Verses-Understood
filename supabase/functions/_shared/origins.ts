/**
 * Which browser origins may call the Edge Functions.
 *
 * Kept free of any Deno reference so it can be unit-tested from the app's own
 * test runner — CORS is the kind of thing that is easy to get subtly wrong and
 * hard to notice until production breaks.
 */

/** Local development origins are always welcome, whatever the deployment. */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function parseAllowList(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * The value for Access-Control-Allow-Origin, or null to send no such header —
 * which is how a request is refused.
 *
 * With no allow-list configured the functions stay open, because reading
 * Scripture is public and any site may embed it. Configure ALLOWED_ORIGINS to
 * restrict them to your own domains.
 */
export function resolveAllowOrigin(origin: string | null, allowList: string[]): string | null {
  if (allowList.length === 0) return '*';

  const candidate = (origin ?? '').replace(/\/$/, '');
  if (!candidate) return null;
  if (allowList.includes(candidate)) return candidate;
  if (DEV_ORIGIN.test(candidate)) return candidate;
  return null;
}

export function isDevOrigin(origin: string): boolean {
  return DEV_ORIGIN.test(origin.replace(/\/$/, ''));
}
