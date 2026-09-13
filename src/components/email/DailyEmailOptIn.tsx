import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/analytics';
import {
  EmailSubscriptionError,
  getSubscription,
  isDailyEmailConfigured,
  requestDailyEmail,
  setSubscription,
  type SubscriptionState,
} from '../../lib/email';

/**
 * Asking for the Verse of the Day by email.
 *
 * Two shapes, one component. On a page it is an invitation with a field; in
 * the profile it is a setting a reader already made a decision about. Nobody
 * is signed up by making an account, and a guest's address gets one
 * confirmation email and nothing else until they click the link in it.
 */
export function DailyEmailOptIn({ variant = 'card' }: { variant?: 'card' | 'setting' }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  // A signed-in reader is told what they already have, rather than being asked
  // again. A guest has nothing to look up.
  useEffect(() => {
    if (!user || !isDailyEmailConfigured) {
      setState(null);
      return;
    }
    let active = true;
    getSubscription()
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {
        /* the form still works */
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!isDailyEmailConfigured) return null;

  const onGuestSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await requestDailyEmail(email);
      trackEvent('daily_email_subscribe', { source: variant, signed_in: false });
      setMessage({
        text: 'Check your inbox — one email is on its way with a link to confirm. Nothing else is sent until you click it.',
        tone: 'ok',
      });
      setEmail('');
    } catch (error) {
      setMessage({
        text: error instanceof EmailSubscriptionError ? error.message : 'That did not go through.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (subscribed: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await setSubscription(subscribed, user?.email ?? undefined);
      setState(next);
      trackEvent(subscribed ? 'daily_email_subscribe' : 'daily_email_unsubscribe', {
        source: variant,
        signed_in: true,
      });
      setMessage({
        text: subscribed
          ? 'You will get the Verse of the Day once a day. Every email has an unsubscribe link.'
          : 'Stopped. Nothing else will be sent.',
        tone: 'ok',
      });
    } catch (error) {
      setMessage({
        text: error instanceof EmailSubscriptionError ? error.message : 'That did not go through.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const disclosure = (
    <p className="mt-2 text-ui-xs muted">
      One email a day: the Verse of the Day and a short devotional. Unsubscribe from any of them.
      We never share your address.
    </p>
  );

  const note = message ? (
    <p
      className={`mt-3 text-ui-sm ${message.tone === 'error' ? 'text-[rgb(var(--rose))]' : 'text-[rgb(var(--gold))]'}`}
      role="status"
    >
      {message.text}
    </p>
  ) : null;

  /* ---- In the profile, for somebody who has an account ----------------- */
  if (variant === 'setting') {
    return (
      <div>
        {user ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ui-base font-semibold">
                  {state?.subscribed ? 'You get the Verse of the Day' : 'Get the Verse of the Day'}
                </p>
                <p className="mt-0.5 text-ui-sm muted">
                  {state?.subscribed
                    ? `Sent once a day to ${state.email ?? user.email}.`
                    : `It would go to ${user.email}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onToggle(!state?.subscribed)}
                disabled={busy}
                className={`btn min-h-0 px-4 py-2 text-ui-sm ${state?.subscribed ? 'btn-secondary' : 'btn-primary'}`}
              >
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {state?.subscribed ? 'Stop sending it' : 'Send it to me'}
              </button>
            </div>
            {state?.suppressed ? (
              <p className="mt-2 text-ui-sm muted">
                Sending stopped because the last few emails could not be delivered. Turning it back
                on will try again.
              </p>
            ) : null}
            {disclosure}
            {note}
          </>
        ) : (
          <p className="text-ui-sm muted">Sign in to manage the daily email.</p>
        )}
      </div>
    );
  }

  /* ---- On a page, for anybody ----------------------------------------- */
  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Icon name="mail" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold))]" />
        <div className="min-w-0 flex-1">
          <h2 className="display text-[1.25rem] leading-tight">Get the Verse of the Day</h2>
          <p className="mt-1.5 text-ui-sm">
            Receive today’s Scripture and devotional in your inbox.
          </p>

          {user ? (
            <>
              <button
                type="button"
                onClick={() => void onToggle(!state?.subscribed)}
                disabled={busy}
                className={`btn mt-4 ${state?.subscribed ? 'btn-secondary' : 'btn-primary'}`}
              >
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {state?.subscribed ? 'Stop sending it' : `Send it to ${user.email}`}
              </button>
              {disclosure}
              {note}
            </>
          ) : (
            <>
              <form onSubmit={(event) => void onGuestSubmit(event)} className="mt-4 flex flex-wrap gap-2">
                <label htmlFor="daily-email" className="sr-only">
                  Your email address
                </label>
                <input
                  id="daily-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="field min-w-0 flex-1 basis-[14rem]"
                />
                <button type="submit" disabled={busy} className="btn btn-primary shrink-0">
                  {busy ? <Spinner className="h-4 w-4" /> : null}
                  Send it to me
                </button>
              </form>
              {disclosure}
              {note}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
