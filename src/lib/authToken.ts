import { SUPABASE_ANON_KEY } from './env';
import { supabase } from './supabase';

/**
 * The reader's access token, resolved once rather than before every call.
 *
 * getSession() can go to the network to refresh an expiring token. It used to
 * sit directly in front of the study request, so an explanation waited on an
 * auth round trip that had nothing to do with it. It is warmed when the app
 * starts and replaced when the session changes; a request reads whatever is
 * current without awaiting anything first.
 */
let currentToken = SUPABASE_ANON_KEY;
let warming: Promise<void> | null = null;

export function warmAuthToken(): Promise<void> {
  if (!supabase) return Promise.resolve();
  warming ??= supabase.auth
    .getSession()
    .then(({ data }) => {
      currentToken = data.session?.access_token || SUPABASE_ANON_KEY;
    })
    .catch(() => {
      /* signed out; the anon key is right */
    });
  return warming;
}

/** The token to send now. Only the first caller ever waits. */
export async function authToken(): Promise<string> {
  await warmAuthToken();
  return currentToken;
}

if (supabase) {
  void warmAuthToken();
  supabase.auth.onAuthStateChange((_event, session) => {
    currentToken = session?.access_token || SUPABASE_ANON_KEY;
    warming = Promise.resolve();
  });
}
