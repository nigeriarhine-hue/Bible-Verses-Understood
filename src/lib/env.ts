/**
 * Client-side configuration.
 *
 * Only `VITE_`-prefixed variables reach the browser bundle. Service-role keys
 * and the Google Generative Language key live exclusively in Supabase Edge
 * Function secrets and are never referenced here.
 */

function readEnv(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The site's public origin, e.g. https://bible-verses-understood.vercel.app
 *
 * Set VITE_SITE_URL in the Production environment only. It is used for
 * canonical URLs, Open Graph tags and share links, which must name the public
 * domain even when the page is served from a preview URL.
 *
 * Moving to a custom domain means changing this one variable — nothing in the
 * codebase names a domain.
 */
export const SITE_URL = (
  readEnv('VITE_SITE_URL') || (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/$/, '');

export const SUPABASE_URL = readEnv('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY');
export const GA_MEASUREMENT_ID = readEnv('VITE_GA_MEASUREMENT_ID') || 'G-YT6WK8YMX9';

/** True when accounts, saving and history can work. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Base URL for Supabase Edge Functions (commentary, devotionals, providers). */
export const FUNCTIONS_URL =
  readEnv('VITE_FUNCTIONS_URL') || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1` : '');

/** True when generated commentary can be requested. */
export const isCommentaryConfigured = Boolean(FUNCTIONS_URL);
