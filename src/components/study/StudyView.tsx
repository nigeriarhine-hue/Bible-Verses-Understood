import { Icon } from '../ui/Icon';
import { LinkedProse } from './LinkedProse';
import { RelatedScriptureCards } from './RelatedScriptureCards';
import type { Study } from '../../lib/ai/types';

/**
 * A generated study, rendered section by section.
 *
 * Everything here is commentary, and is presented as commentary — the Scripture
 * lives in its own card above, on a different surface entirely.
 */
export function StudyView({
  study,
  translation,
  onAudio,
  audioActive,
  audioSupported,
}: {
  study: Study;
  translation: string;
  onAudio?: () => void;
  audioActive?: boolean;
  audioSupported?: boolean;
}) {
  return (
    <div className="space-y-4">
      {study.summary ? (
        <section className="glass p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <p className="eyebrow">In short</p>
            {audioSupported && onAudio ? (
              <button type="button" onClick={onAudio} className="btn btn-ghost min-h-0 px-3 py-1.5 text-ui-xs">
                <Icon name={audioActive ? 'stop' : 'speaker'} className="h-4 w-4" />
                {audioActive ? 'Stop' : 'Listen'}
              </button>
            ) : null}
          </div>
          <LinkedProse text={study.summary} className="prose-study mt-2.5" />
        </section>
      ) : null}

      {study.sections.map((section) => (
        <section key={section.heading} className="glass p-5 sm:p-6">
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">{section.heading}</h3>
          <LinkedProse text={section.body} className="prose-study mt-3" />
        </section>
      ))}

      {study.keyTerms && study.keyTerms.length > 0 ? (
        <section className="glass p-5 sm:p-6">
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">
            Key Words and Original Language
          </h3>
          <dl className="mt-4 space-y-4">
            {study.keyTerms.map((term) => (
              <div key={term.term} className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-ui-base font-semibold">{term.term}</span>
                  {term.original ? (
                    <span className="font-serif text-[1.15rem] text-[rgb(var(--gold))]">
                      {term.original}
                    </span>
                  ) : null}
                  {term.transliteration ? (
                    <span className="text-ui-sm italic muted">{term.transliteration}</span>
                  ) : null}
                  {term.language ? (
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-ui-xs muted">
                      {term.language}
                    </span>
                  ) : null}
                </dt>
                <dd className="mt-2 text-prose-base leading-relaxed">
                  <LinkedProse text={term.meaning} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {study.interpretations && study.interpretations.length > 0 ? (
        <section className="glass p-5 sm:p-6">
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">
            Different Christian Interpretations
          </h3>
          <p className="mt-2 text-ui-sm muted">
            Sincere readers of Scripture have understood this passage in more than one way. These
            positions are set out as their holders would state them.
          </p>
          <ul className="mt-4 space-y-3">
            {study.interpretations.map((entry) => (
              <li key={entry.position} className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                <p className="text-ui-base font-semibold">{entry.position}</p>
                {entry.heldBy ? <p className="mt-0.5 text-ui-xs muted">Held by: {entry.heldBy}</p> : null}
                <LinkedProse text={entry.summary} className="prose-study mt-2" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {study.reflectionQuestions && study.reflectionQuestions.length > 0 ? (
        <section className="glass p-5 sm:p-6">
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">Reflection Questions</h3>
          <ul className="mt-3 space-y-2.5">
            {study.reflectionQuestions.map((question) => (
              <li key={question} className="flex gap-3 text-prose-base">
                <Icon name="sparkle" className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--gold))]" />
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {study.prayer ? (
        <section className="glass p-5 sm:p-6">
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">A Prayer</h3>
          <LinkedProse text={study.prayer} className="prose-study mt-3 italic" />
        </section>
      ) : null}

      {study.relatedScripture.length > 0 ? (
        <section className="space-y-3">
          <div className="glass px-5 py-4">
            <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">Related Scripture</h3>
            <p className="mt-1 text-ui-sm muted">
              Open any of these to study it in full, then keep following where it leads.
            </p>
          </div>
          <RelatedScriptureCards
            related={study.relatedScripture}
            translation={translation}
            fromReference={study.reference}
          />
        </section>
      ) : null}
    </div>
  );
}
