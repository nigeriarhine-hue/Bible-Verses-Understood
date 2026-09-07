import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { takeReturnPath } from '../lib/storage';

type Mode = 'signup' | 'signin' | 'reset';

export default function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { user, accountsAvailable, signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (user) return <Navigate to={takeReturnPath() ?? '/profile'} replace />;

  if (!accountsAvailable) {
    return (
      <div className="container-page py-10">
        <div className="glass mx-auto max-w-lg p-6">
          <h1 className="display text-2xl">Accounts are not available yet</h1>
          <p className="mt-3 text-prose-base">
            This deployment has no Supabase project configured, so sign-in is switched off. Reading
            Scripture, studying it, browsing topics and following Related Scripture all work without
            an account.
          </p>
          <Link to="/" className="btn btn-primary mt-5">
            Back to reading
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'reset') {
        await resetPassword(email);
        setSent(email);
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password, displayName || undefined);
        if (needsConfirmation) {
          setSent(email);
        } else {
          notify('Welcome. Your account is ready.', 'success');
          navigate(takeReturnPath() ?? '/profile', { replace: true });
        }
      } else {
        await signIn(email, password);
        notify('Signed in.', 'success');
        navigate(takeReturnPath() ?? '/profile', { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="container-page py-10">
        <div className="glass mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <h1 className="display mt-4 text-2xl">Check your email</h1>
          <p className="mt-3 text-prose-base">
            {mode === 'reset'
              ? `We have sent a password reset link to ${sent}.`
              : `We have sent a confirmation link to ${sent}. Open it to finish setting up your account.`}
          </p>
          <Link to="/" className="btn btn-secondary mt-5">
            Back to reading
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="glass p-6">
          <h1 className="display text-[1.75rem] leading-tight">
            {mode === 'signup' ? 'Create your free account' : mode === 'signin' ? 'Welcome back' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-ui-base muted">
            {mode === 'reset'
              ? 'We will email you a link to set a new password.'
              : 'An account keeps your saved verses, studies, collections and history with you. Everything else works without one.'}
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            {mode === 'signup' ? (
              <div>
                <label htmlFor="display-name" className="mb-1.5 block text-ui-sm font-medium">
                  Your name <span className="muted">(optional)</span>
                </label>
                <input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  className="field"
                  maxLength={80}
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-ui-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="field"
              />
            </div>

            {mode !== 'reset' ? (
              <div>
                <label htmlFor="password" className="mb-1.5 block text-ui-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="field"
                />
                {mode === 'signup' ? (
                  <p className="mt-1.5 text-ui-xs muted">At least six characters.</p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-[#ff9c8b]/40 bg-[#ff9c8b]/10 px-4 py-3 text-ui-sm"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
            </button>
          </form>

          {mode !== 'reset' ? (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/15" />
                <span className="text-ui-xs muted">or</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
              <button
                type="button"
                onClick={() => {
                  void signInWithGoogle().catch((caught: unknown) =>
                    setError(caught instanceof Error ? caught.message : 'Google sign-in failed.'),
                  );
                }}
                className="btn btn-secondary w-full"
              >
                Continue with Google
              </button>
              <p className="mt-2 text-center text-ui-xs muted">
                Available when Google sign-in has been enabled for this deployment.
              </p>
            </>
          ) : null}
        </div>

        <div className="glass p-5 text-center text-ui-sm">
          {mode === 'signup' ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="font-semibold text-[rgb(var(--gold))] underline underline-offset-4"
              >
                Sign in
              </button>
            </p>
          ) : mode === 'signin' ? (
            <div className="space-y-2">
              <p>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="font-semibold text-[rgb(var(--gold))] underline underline-offset-4"
                >
                  Create a free account
                </button>
              </p>
              <p>
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="muted underline underline-offset-4"
                >
                  Forgotten your password?
                </button>
              </p>
            </div>
          ) : (
            <p>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="font-semibold text-[rgb(var(--gold))] underline underline-offset-4"
              >
                Back to sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
