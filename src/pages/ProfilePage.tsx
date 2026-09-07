import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TranslationSelector } from '../components/layout/TranslationSelector';
import { ExplanationModeTabs } from '../components/study/ExplanationModeTabs';
import { Icon } from '../components/ui/Icon';
import { SignedOutPrompt } from '../components/ui/SignedOutPrompt';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { TOPICS } from '../data/topics';

export default function ProfilePage() {
  const { user, loading: authLoading, accountsAvailable, signOut } = useAuth();
  const { notify } = useToast();
  const {
    explanationMode,
    setExplanationMode,
    audioEnabled,
    setAudioEnabled,
    selectedTopics,
    setSelectedTopics,
    personalizationEnabled,
    setPersonalizationEnabled,
  } = usePreferences();

  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ''));
  }, [user]);

  if (authLoading) {
    return (
      <div className="container-page py-20 text-center">
        <span className="glass-pill">
          <Spinner className="h-4 w-4" /> Loading
        </span>
      </div>
    );
  }

  const toggleTopic = (slug: string) => {
    const next = selectedTopics.includes(slug)
      ? selectedTopics.filter((entry) => entry !== slug)
      : [...selectedTopics, slug];
    setSelectedTopics(next);
  };

  const saveName = async () => {
    if (!user || !supabase) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);
    setSavingName(false);
    notify(error ? error.message : 'Your name has been updated.', error ? 'error' : 'success');
  };

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">
          {user ? 'Your profile' : 'Reading preferences'}
        </h1>
        <p className="mt-2 text-ui-base muted">
          {user
            ? 'These settings follow you wherever you read.'
            : 'These settings are kept in this browser. Create an account to keep them across devices.'}
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Reading preferences — available to everyone                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Bible translation</h2>
        <p className="mt-1.5 text-ui-sm muted">
          Used everywhere, and changeable from the header on any page.
        </p>
        <div className="mt-4 max-w-xs">
          <TranslationSelector variant="block" />
        </div>
      </section>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Default explanation depth</h2>
        <p className="mt-1.5 text-ui-sm muted">
          Where each study starts. You can switch on any page.
        </p>
        <div className="mt-4">
          <ExplanationModeTabs mode={explanationMode} onChange={setExplanationMode} />
        </div>
      </section>

      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">Audio</h2>
        <Toggle
          checked={audioEnabled}
          onChange={setAudioEnabled}
          label="Show listening controls"
          hint="Audio never plays on its own — you always press play."
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Personalisation                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="glass p-5 sm:p-6">
        <h2 className="display text-[1.25rem]">What matters to you right now</h2>
        <p className="mt-1.5 text-ui-sm muted">
          Choose any subjects that are on your mind. When personalisation is on, your daily
          devotional will lean towards them where the passage genuinely supports it.
        </p>

        <div className="mt-4">
          <Toggle
            checked={personalizationEnabled}
            onChange={setPersonalizationEnabled}
            label="Use these subjects in my devotional"
            hint="Turn this off and devotionals stay general. Your choices are never shared."
          />
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {TOPICS.map((topic) => {
            const active = selectedTopics.includes(topic.slug);
            return (
              <li key={topic.slug}>
                <button
                  type="button"
                  onClick={() => toggleTopic(topic.slug)}
                  aria-pressed={active}
                  className={`btn min-h-0 px-3.5 py-2 text-ui-xs ${active ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  {topic.name}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Account                                                             */}
      {/* ------------------------------------------------------------------ */}
      {user ? (
        <section className="glass p-5 sm:p-6">
          <h2 className="display text-[1.25rem]">Account</h2>
          <p className="mt-1.5 text-ui-sm muted">{user.email}</p>

          <div className="mt-4 max-w-sm">
            <label htmlFor="profile-name" className="mb-1.5 block text-ui-sm font-medium">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="field"
                maxLength={80}
              />
              <button type="button" onClick={() => void saveName()} className="btn btn-secondary px-4" disabled={savingName}>
                {savingName ? <Spinner className="h-4 w-4" /> : 'Save'}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/12 pt-5">
            <Link to="/saved" className="btn btn-secondary">
              <Icon name="bookmark" className="h-4 w-4" />
              Saved
            </Link>
            <Link to="/history" className="btn btn-secondary">
              <Icon name="clock" className="h-4 w-4" />
              History
            </Link>
            <button type="button" onClick={() => void signOut()} className="btn btn-ghost">
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <SignedOutPrompt
          title="Keep these settings with you"
          body="A free account keeps your translation, saved verses, collections and history across every device you read on."
          accountsAvailable={accountsAvailable}
        />
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-7 w-12 shrink-0 rounded-full border transition ${
          checked ? 'border-[rgb(var(--gold))] bg-[rgb(var(--gold))]' : 'border-white/25 bg-white/10'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition ${
            checked ? 'translate-x-[1.4rem]' : 'translate-x-0.5'
          }`}
        />
        <span className="sr-only">{label}</span>
      </button>
      <div>
        <p className="text-ui-base font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-ui-sm muted">{hint}</p> : null}
      </div>
    </div>
  );
}
