import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';
import type { Database } from '../types/database';

/**
 * The Supabase client, or null when the project has not been configured.
 *
 * Reading and studying Scripture never touches this. Accounts, saving,
 * collections and history do — and they degrade to a clear message rather than
 * a broken screen when it is absent.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: { headers: { 'x-application-name': 'bible-verses-understood' } },
    })
  : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error('Accounts are not available: this deployment has no Supabase project configured.');
  }
  return supabase;
}

export { isSupabaseConfigured };
