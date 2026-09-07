import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/** The polished prompt a guest sees where an account is genuinely required. */
export function SignedOutPrompt({
  title,
  body,
  accountsAvailable,
}: {
  title: string;
  body: string;
  accountsAvailable: boolean;
}) {
  return (
    <div className="container-page py-8">
      <div className="glass mx-auto max-w-xl p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
          <Icon name="bookmark" className="h-6 w-6" />
        </span>
        <h1 className="display mt-4 text-[1.625rem] leading-tight">{title}</h1>
        <p className="mt-3 text-prose-base">{body}</p>

        {accountsAvailable ? (
          <>
            <ul className="mt-5 space-y-2.5 text-ui-sm">
              {[
                'Save verses and studies to return to.',
                'Group them into collections that make sense to you.',
                'Keep your study history across devices.',
                'Choose subjects that shape your daily devotional.',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--gold))]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/sign-in" className="btn btn-primary">
                Create a free account
              </Link>
              <Link to="/sign-in?mode=signin" className="btn btn-secondary">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-4 text-ui-sm muted">
            Accounts are not configured for this deployment yet, so this part is unavailable.
            Everything else works as normal.
          </p>
        )}

        <p className="mt-6 border-t border-white/12 pt-4 text-ui-sm muted">
          Searching, reading, studying, browsing topics and following Related Scripture all work
          without an account, and always will.
        </p>
      </div>
    </div>
  );
}
