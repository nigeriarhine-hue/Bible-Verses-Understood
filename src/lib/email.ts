import { FUNCTIONS_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './env';
import { authToken } from './authToken';

/**
 * The daily verse email, from the browser's side.
 *
 * Nothing here knows the Resend key — it is a Supabase secret, used only
 * inside the Edge Function. This asks the function to act and reports what it
 * said.
 */

export interface SubscriptionState {
  subscribed: boolean;
  email: string | null;
  /** Waiting on a confirmation link. */
  pending: boolean;
  /** Stopped after repeated delivery failures. */
  suppressed?: boolean;
}

export class EmailSubscriptionError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'failed',
  ) {
    super(message);
    this.name = 'EmailSubscriptionError';
  }
}

/** True when the subscription endpoint can be reached at all. */
export const isDailyEmailConfigured = Boolean(FUNCTIONS_URL && isSupabaseConfigured);

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!isDailyEmailConfigured) {
    throw new EmailSubscriptionError(
      'The daily email is not switched on for this deployment yet.',
      'not_configured',
    );
  }
  const token = await authToken();

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/email-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EmailSubscriptionError('Could not reach the server. Check your connection.', 'failed');
  }

  if (!res.ok) {
    let message = 'That did not go through. Please try again.';
    let code: 'not_configured' | 'failed' = 'failed';
    try {
      const payload = (await res.json()) as { error?: string; code?: string };
      if (payload.error) message = payload.error;
      if (payload.code === 'email_not_configured') code = 'not_configured';
    } catch {
      /* keep the default message */
    }
    throw new EmailSubscriptionError(message, code);
  }

  return (await res.json()) as T;
}

/** Starts the opt-in. A guest gets a confirmation email; nothing else is sent. */
export async function requestDailyEmail(email: string): Promise<{ pending: boolean }> {
  return call<{ pending: boolean }>({ action: 'subscribe', email });
}

/** What a signed-in reader currently has. */
export async function getSubscription(): Promise<SubscriptionState> {
  return call<SubscriptionState>({ action: 'status' });
}

/** Turns it on or off for a signed-in reader, whose address is already verified. */
export async function setSubscription(
  subscribed: boolean,
  email?: string,
): Promise<SubscriptionState> {
  return call<SubscriptionState>({ action: 'set', subscribed, ...(email ? { email } : {}) });
}
