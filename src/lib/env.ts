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
