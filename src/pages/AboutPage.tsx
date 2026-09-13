import { Link } from 'react-router-dom';
import { Disclaimer } from '../components/layout/Disclaimer';
import { Icon } from '../components/ui/Icon';
import { usePreferences } from '../context/PreferencesContext';

export default function AboutPage() {
  const { translations } = usePreferences();
  const available = translations.filter((t) => t.isAvailable);
  const awaiting = translations.filter((t) => !t.isAvailable);

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">
          About Bible Verses Understood
        </h1>
        <p className="mt-2 text-ui-lg muted">Understand the Word. Apply it to your life.</p>
      </header>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Scripture and commentary are not the same thing</h2>
        <div className="prose-study mt-3 space-y-4">
          <p>
            Bible text on this site is retrieved from a Bible source and shown exactly as it reads.
            It is never generated, paraphrased or rewritten. You will always find it on its own
            light card, set in a serif face, with the translation named.
          </p>
          <p>
            Everything else — the explanations, the reflections, the suggested passages — is
            commentary produced by an AI model reading that Scripture. It is offered to help you
            think, not to settle a question for you. It can be wrong, and it will sometimes reflect
            one Christian tradition's reading more than another's.
          </p>
          <p>
            Every Bible reference the model suggests is checked against the text before it is shown
            to you. If it cites something that does not exist, that suggestion is quietly dropped
            rather than shown as a link to nowhere.
          </p>
        </div>
      </section>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">What we will not do</h2>
        <ul className="mt-3 space-y-2.5 text-prose-base">
          {[
            'Tell you what God is saying to you personally.',
            'Predict your future or promise a particular outcome.',
            'Present one tradition’s reading as the only faithful one.',
            'Put generated words forward as Bible text.',
            'Stand in for a pastor, a counsellor, a therapist or a doctor.',
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <Icon name="shield" className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--gold))]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Translations</h2>
        <p className="mt-2 text-ui-base muted">
          A translation appears here only when it can legally be served. We do not fabricate access
          to copyrighted texts.
        </p>

        <h3 className="mt-5 text-ui-sm font-semibold uppercase tracking-wider muted">
          Available now
        </h3>
        <ul className="mt-2.5 space-y-2.5">
          {available.map((entry) => (
            <li key={entry.abbreviation} className="rounded-xl border border-white/12 bg-white/[0.05] p-3.5">
              <p className="text-ui-base font-semibold">
                {entry.name} <span className="muted">({entry.abbreviation})</span>
              </p>
              {entry.copyrightNotice ? (
                <p className="mt-1 text-ui-xs leading-relaxed muted">{entry.copyrightNotice}</p>
              ) : null}
            </li>
          ))}
        </ul>

        {awaiting.length > 0 ? (
          <>
            <h3 className="mt-6 text-ui-sm font-semibold uppercase tracking-wider muted">
              Prepared, awaiting licensed access
            </h3>
            <p className="mt-1.5 text-ui-sm muted">
              The interface and data model already support these. They will become selectable when
              an authorised provider key is configured for them.
            </p>
            <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              {awaiting.map((entry) => (
                <li key={entry.abbreviation} className="flex items-baseline gap-2.5 text-ui-sm">
                  <span className="w-16 shrink-0 font-semibold">{entry.abbreviation}</span>
                  <span className="muted">{entry.name}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Your privacy</h2>
        <div className="prose-study mt-3 space-y-4">
          <p>
            You can read, search and study everything here without an account. Signed out, your
            translation, history and study trail stay in your own browser.
          </p>
          <p>
            What you type into the search field is used to answer that
            question and nothing else. It is not stored in our database and is never sent to
            analytics. Analytics records which kinds of pages are used — a reference, a translation,
            a mode — never anything personal you have typed.
          </p>
          <p>
            With an account, your saved verses, studies, collections, history and preferences are
            visible only to you. That is enforced by row-level security in the database, not just by
            the app.
          </p>
        </div>
      </section>

      <Disclaimer />

      <div className="flex flex-wrap gap-2">
        <Link to="/" className="btn btn-primary">
          Start reading
        </Link>
        <Link to="/topics" className="btn btn-secondary">
          Browse topics
        </Link>
      </div>
    </div>
  );
}
