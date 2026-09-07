import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      notify('Your password has been changed.', 'success');
      navigate('/profile', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That password could not be set.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-6 pb-10">
      <div className="glass mx-auto max-w-lg p-6">
        <h1 className="display text-[1.75rem] leading-tight">Choose a new password</h1>
        <p className="mt-2 text-ui-base muted">
          Open this page from the link in your reset email, then set the password you would like to
          use.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-ui-sm font-medium">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="field"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl border border-[#ff9c8b]/40 bg-[#ff9c8b]/10 px-4 py-3 text-ui-sm">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            Set new password
          </button>
        </form>
      </div>
    </div>
  );
}
