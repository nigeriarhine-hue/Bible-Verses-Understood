import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DailyEmailOptIn } from '../components/email/DailyEmailOptIn';
import { AudioButton } from '../components/scripture/AudioButton';
import { SaveVerseButton } from '../components/scripture/SaveVerseButton';
import { ScriptureCard } from '../components/scripture/ScriptureCard';
import { ShareButton } from '../components/scripture/ShareButton';
import { LinkedProse } from '../components/study/LinkedProse';
import { RelatedScriptureCards } from '../components/study/RelatedScriptureCards';
import { Icon } from '../components/ui/Icon';
import { LoadingLines, Spinner } from '../components/ui/Spinner';
import { usePreferences } from '../context/PreferencesContext';
import { useDailyVerse } from '../hooks/useDailyVerse';
import { usePassage } from '../hooks/useScripture';
import { useSpeech } from '../hooks/useSpeech';
import { CommentaryError, getDevotional } from '../lib/ai/client';
import type { Devotional } from '../lib/ai/types';
import { trackEvent } from '../lib/analytics';
import { referenceToPath } from '../lib/bible/reference';

export default function DailyPage() {
  const { translation, selectedTopics, personalizationEnabled } = usePreferences();
  const { data: daily, loading: dailyLoading } = useDailyVerse();
  const { data: passage, loading: passageLoading } = usePassage(daily?.reference ?? null, translation);
  const { speak, speakingId, supported } = useSpeech();

  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [devotionalLoading, setDevotionalLoading] = useState(false);
  const [devotionalError, setDevotionalError] = useState<{ message: string; code: string } | null>(null);

  const interests = personalizationEnabled ? selectedTopics : [];

  useEffect(() => {
    if (!passage) return;
    trackEvent('devotional_view', {
      reference: passage.reference.reference,
      translation: passage.translation,
    });

    let active = true;
    setDevotionalLoading(true);
    setDevotionalError(null);
    setDevotional(null);

    getDevotional({
      reference: passage.reference.reference,
      translation: passage.translation,
      scriptureText: passage.text,
      interests,
    })
      .then((result) => {
        if (active) setDevotional(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDevotionalError({
          message:
            error instanceof CommentaryError
              ? error.message
              : "Today's devotional could not be loaded.",
          code: error instanceof CommentaryError ? error.code : 'failed',
        });
      })
      .finally(() => {
        if (active) setDevotionalLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage?.reference.reference, passage?.translation, interests.join(',')]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <p className="eyebrow">{today}</p>
        <h1 className="display mt-1.5 text-[1.75rem] leading-tight sm:text-[2.25rem]">
          Verse of the Day
        </h1>
        {daily?.featuredNote ? (
          <p className="mt-2 text-ui-base muted">{daily.featuredNote}</p>
        ) : (
          <p className="mt-2 text-ui-base muted">
            One passage, read slowly, with a devotional to sit alongside it.
          </p>
        )}
      </header>

      {dailyLoading || passageLoading || !passage ? (
        <div className="glass-light p-6">
          <LoadingLines lines={3} label="Loading today's verse" />
        </div>
      ) : (
        <>
          <ScriptureCard
            passage={passage}
            actions={
              <>
                {supported ? (
                  <AudioButton
                    active={speakingId === 'daily-scripture'}
                    onToggle={() =>
                      speak('daily-scripture', `${passage.reference.reference}. ${passage.text}`, 'scripture')
                    }
                  />
                ) : null}
                <SaveVerseButton passage={passage} />
                <ShareButton passage={passage} />
              </>
            }
          />

          <div className="flex flex-wrap gap-2">
            <Link
              to={referenceToPath(passage.reference)}
              state={{ source: 'daily', resetTrail: true }}
              className="btn btn-primary"
            >
              Understand This Verse
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Today's Devotional                                              */}
          {/* -------------------------------------------------------------- */}
          <section className="space-y-4">
            <div className="glass px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="display text-[1.375rem] leading-tight">Today’s Devotional</h2>
                  {devotional?.isPersonalized ? (
                    <p className="mt-1 text-ui-xs muted">
                      Shaped by the subjects you chose in your profile.
                    </p>
                  ) : null}
                </div>
                {devotional && supported ? (
                  <AudioButton
                    tone="dark"
                    active={speakingId === 'devotional'}
                    onToggle={() =>
                      speak(
                        'devotional',
                        [
                          devotional.title,
                          ...devotional.sections.map((s) => `${s.heading}. ${s.body}`),
                          devotional.prayer,
                        ].join('\n\n'),
                        'devotional',
                      )
                    }
                  />
                ) : null}
              </div>
            </div>

            {devotionalLoading ? (
              <div className="glass p-5 sm:p-6">
                <p className="inline-flex items-center gap-2 text-ui-sm muted">
                  <Spinner className="h-4 w-4" />
                  Writing today’s devotional…
                </p>
                <div className="mt-4">
                  <LoadingLines lines={6} />
                </div>
              </div>
            ) : devotionalError ? (
              <div className="glass p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold))]" />
                  <div>
                    <h3 className="display text-[1.125rem]">
                      {devotionalError.code === 'not_configured'
                        ? 'Devotionals are not switched on yet'
                        : devotionalError.code === 'daily_limit'
                          ? "Today's devotional limit has been reached"
                          : 'The devotional did not load'}
                    </h3>
                    <p className="mt-2 text-prose-base">{devotionalError.message}</p>
                    <p className="mt-2 text-ui-sm muted">
                      The Verse of the Day above is unaffected.
                    </p>
                  </div>
                </div>
              </div>
            ) : devotional ? (
              <>
                {devotional.title ? (
                  <div className="glass px-5 py-5 sm:px-6">
                    <h3 className="display text-[1.375rem] leading-tight">{devotional.title}</h3>
                  </div>
                ) : null}

                {devotional.sections.map((section) => (
                  <section key={section.heading} className="glass p-5 sm:p-6">
                    <h4 className="display text-[1.1875rem] leading-tight">{section.heading}</h4>
                    <LinkedProse text={section.body} className="prose-study mt-3" />
                  </section>
                ))}

                {devotional.reflectionQuestion ? (
                  <section className="glass p-5 sm:p-6">
                    <h4 className="display text-[1.1875rem] leading-tight">Reflection Question</h4>
                    <p className="prose-study mt-3">{devotional.reflectionQuestion}</p>
                  </section>
                ) : null}

                {devotional.prayer ? (
                  <section className="glass p-5 sm:p-6">
                    <h4 className="display text-[1.1875rem] leading-tight">Prayer</h4>
                    <LinkedProse text={devotional.prayer} className="prose-study mt-3 italic" />
                  </section>
                ) : null}

                {devotional.relatedScripture.length > 0 ? (
                  <section className="space-y-3">
                    <div className="glass px-5 py-4">
                      <h4 className="display text-[1.1875rem] leading-tight">Related Scripture</h4>
                    </div>
                    <RelatedScriptureCards
                      related={devotional.relatedScripture}
                      translation={passage.translation}
                      fromReference={passage.reference.reference}
                    />
                  </section>
                ) : null}
              </>
            ) : null}
          </section>

          {/* The invitation comes after the reading, not in front of it. */}
          <DailyEmailOptIn />
        </>
      )}
    </div>
  );
}
