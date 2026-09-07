import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScriptureCard } from '../components/scripture/ScriptureCard';
import { LinkedProse } from '../components/study/LinkedProse';
import { RelatedScriptureCards } from '../components/study/RelatedScriptureCards';
import { Icon } from '../components/ui/Icon';
import { LoadingLines, Spinner } from '../components/ui/Spinner';
import { usePreferences } from '../context/PreferencesContext';
import { CommentaryError, searchLifeSituation } from '../lib/ai/client';
import type { SituationGuidance } from '../lib/ai/types';
import { trackEvent } from '../lib/analytics';
import { getPassage } from '../lib/bible/provider';
import { parseReference, referenceToPath } from '../lib/bible/reference';
import type { Passage } from '../lib/bible/types';

const EXAMPLES = [
  "I'm scared about losing my job.",
  "I'm grieving.",
  "I'm anxious about my future.",
  "I can't forgive someone.",
  'I feel lonely.',
  'My relationship is struggling.',
  "I don't know my purpose.",
  'How should I handle conflict?',
];

/**
 * Life-situation search.
 *
 * What someone types here stays between them and the passage: it is sent to the
 * commentary service for this one request, is never written to the database,
 * and never reaches analytics.
 */
export default function GuidancePage() {
  const location = useLocation();
  const { translation } = usePreferences();
  const initial = (location.state as { query?: string } | null)?.query ?? '';

  const [situation, setSituation] = useState(initial);
  const [submitted, setSubmitted] = useState<string | null>(initial || null);
  const [guidance, setGuidance] = useState<SituationGuidance | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!submitted) return;
    let active = true;
    setLoading(true);
    setError(null);
    setGuidance(null);
    setPassage(null);

    trackEvent('verse_search', { intent: 'life_situation' });

    searchLifeSituation(submitted, translation)
      .then(async (result) => {
        if (!active) return;
        setGuidance(result);
        // The passage the answer is about is retrieved from Scripture, never
        // taken from the generated text.
        const reference = parseReference(result.primaryReference.reference, { strict: true });
        if (reference) {
          try {
            const retrieved = await getPassage(reference, translation);
            if (active) setPassage(retrieved);
          } catch {
            if (active) setPassage(null);
          }
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError({
          message:
            caught instanceof CommentaryError
              ? caught.message
              : 'A response could not be generated. Please try again.',
          code: caught instanceof CommentaryError ? caught.code : 'failed',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [submitted, translation]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = situation.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">
          What are you facing?
        </h1>
        <p className="mt-2 text-ui-base muted">
          Describe it in your own words. We will find a passage that speaks to it and help you
          understand what it means and how it may apply.
        </p>

        <form onSubmit={onSubmit} className="mt-5">
          <label htmlFor="situation" className="sr-only">
            Describe what you are facing
          </label>
          <textarea
            id="situation"
            value={situation}
            onChange={(event) => setSituation(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="For example: I'm anxious about a decision I have to make this month."
            className="field resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-ui-xs muted">
              What you write here is not saved and is never sent to analytics.
            </p>
            <button type="submit" className="btn btn-primary" disabled={!situation.trim() || loading}>
              {loading ? <Spinner className="h-4 w-4" /> : <Icon name="search" className="h-4 w-4" />}
              Find Scripture
            </button>
          </div>
        </form>

        {!submitted ? (
          <div className="mt-5">
            <p className="text-ui-xs font-semibold uppercase tracking-wider muted">
              Some things people bring here
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setSituation(example)}
                    className="btn btn-secondary min-h-0 px-3.5 py-2 text-ui-xs"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      <div ref={resultsRef} className="space-y-4">
        {loading ? (
          <div className="glass p-5 sm:p-6">
            <p className="inline-flex items-center gap-2 text-ui-sm muted">
              <Spinner className="h-4 w-4" />
              Looking for Scripture that speaks to this…
            </p>
            <div className="mt-4">
              <LoadingLines lines={6} />
            </div>
          </div>
        ) : error ? (
          <div className="glass p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold))]" />
              <div>
                <h2 className="display text-[1.25rem] leading-tight">
                  {error.code === 'not_configured'
                    ? 'This search is not switched on yet'
                    : 'That did not go through'}
                </h2>
                <p className="mt-2 text-prose-base">{error.message}</p>
                <p className="mt-3 text-ui-sm muted">
                  You can still browse by topic — many of the same passages are there.
                </p>
                <Link to="/topics" className="btn btn-primary mt-4">
                  Browse topics
                </Link>
              </div>
            </div>
          </div>
        ) : guidance ? (
          <>
            {guidance.situationSummary ? (
              <section className="glass p-5 sm:p-6">
                <h2 className="display text-[1.25rem] leading-tight">What You’re Facing</h2>
                <p className="prose-study mt-3">{guidance.situationSummary}</p>
              </section>
            ) : null}

            {passage ? (
              <>
                <div className="glass px-5 py-4">
                  <h3 className="display text-[1.25rem] leading-tight">Relevant Scripture</h3>
                </div>
                <ScriptureCard passage={passage} />
                <Link
                  to={referenceToPath(passage.reference)}
                  state={{ source: 'life_situation', resetTrail: true }}
                  className="btn btn-primary"
                >
                  Understand This Verse
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              </>
            ) : null}

            {guidance.sections.map((section) => (
              <section key={section.heading} className="glass p-5 sm:p-6">
                <h3 className="display text-[1.25rem] leading-tight">{section.heading}</h3>
                <LinkedProse text={section.body} className="prose-study mt-3" />
              </section>
            ))}

            {guidance.prayer ? (
              <section className="glass p-5 sm:p-6">
                <h3 className="display text-[1.25rem] leading-tight">A Prayer</h3>
                <LinkedProse text={guidance.prayer} className="prose-study mt-3 italic" />
              </section>
            ) : null}

            {guidance.relatedScripture.length > 0 ? (
              <section className="space-y-3">
                <div className="glass px-5 py-4">
                  <h3 className="display text-[1.25rem] leading-tight">Related Scripture</h3>
                </div>
                <RelatedScriptureCards
                  related={guidance.relatedScripture}
                  translation={translation}
                  fromReference={guidance.primaryReference.reference}
                />
              </section>
            ) : null}

            <section className="glass p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold))]" />
                <p className="text-ui-sm leading-relaxed">
                  If what you are carrying is heavy, please talk to someone you trust — and to a
                  qualified professional where that would help. Scripture and reflection sit
                  alongside that kind of support, not in place of it.
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
