import { useRef, useState, type FormEvent } from 'react';
import { askFollowUp, CommentaryError } from '../../lib/ai/client';
import type { ExplanationMode, RelatedScripture } from '../../lib/ai/types';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { LinkedProse } from './LinkedProse';
import { RelatedScriptureCards } from './RelatedScriptureCards';

const STARTER_QUESTIONS = [
  'Explain this more simply.',
  'What happened before this verse?',
  'What happened after?',
  'Why was this written?',
  'How can this apply to my life?',
  'How could this apply at work?',
  'How could this apply to relationships?',
  'What other Scriptures relate?',
  'Explain the Hebrew or Greek.',
  'Are there different interpretations?',
];

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  related?: RelatedScripture[];
}

/**
 * "Ask About This Verse".
 *
 * The conversation keeps the passage, translation and mode in context. What a
 * reader types here is never sent to analytics.
 */
export function FollowUpPanel({
  reference,
  translation,
  mode,
  scriptureText,
}: {
  reference: string;
  translation: string;
  mode: ExplanationMode;
  scriptureText: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(STARTER_QUESTIONS.slice(0, 5));
  const endRef = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setQuestion('');
    setError(null);
    setPending(true);
    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((current) => [...current, { role: 'user', content: trimmed }]);

    try {
      const answer = await askFollowUp({
        reference,
        translation,
        mode,
        question: trimmed,
        scriptureText,
        history,
      });
      setTurns((current) => [
        ...current,
        { role: 'assistant', content: answer.answer, related: answer.relatedScripture },
      ]);
      if (answer.suggestedQuestions.length > 0) setSuggestions(answer.suggestedQuestions);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (caught) {
      setError(
        caught instanceof CommentaryError
          ? caught.message
          : 'That question could not be answered right now. Please try again.',
      );
      setTurns((current) => current.slice(0, -1));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-[rgb(var(--gold))]">
          <Icon name="message" />
        </span>
        <div>
          <h3 className="display text-[1.25rem] leading-tight sm:text-[1.375rem]">
            Ask About This Verse
          </h3>
          <p className="mt-1 text-ui-sm muted">
            Questions stay anchored to {reference} in the {translation}.
          </p>
        </div>
      </div>

      {turns.length > 0 ? (
        <ol className="mt-5 space-y-4">
          {turns.map((turn, index) => (
            <li key={index}>
              {turn.role === 'user' ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[rgb(var(--gold))] px-4 py-2.5 text-ui-sm font-medium text-[#241701]">
                    {turn.content}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl rounded-bl-md border border-white/12 bg-white/[0.05] p-4">
                  <LinkedProse text={turn.content} className="prose-study" />
                  {turn.related && turn.related.length > 0 ? (
                    <div className="mt-4">
                      <p className="eyebrow mb-2">Related Scripture</p>
                      <RelatedScriptureCards
                        related={turn.related}
                        translation={translation}
                        fromReference={reference}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {pending ? (
        <p className="mt-4 inline-flex items-center gap-2 text-ui-sm muted">
          <Spinner className="h-4 w-4" />
          Thinking about {reference}…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-[#ff9c8b]/40 bg-[#ff9c8b]/10 px-4 py-3 text-ui-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <p className="text-ui-xs font-semibold uppercase tracking-wider muted">
          {turns.length > 0 ? 'You might also ask' : 'Suggested questions'}
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {(turns.length > 0 ? suggestions : STARTER_QUESTIONS).map((item) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => void ask(item)}
                disabled={pending}
                className="btn btn-secondary min-h-0 px-3.5 py-2 text-ui-xs font-medium disabled:opacity-50"
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="follow-up" className="sr-only">
          Ask a question about {reference}
        </label>
        <input
          id="follow-up"
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about this passage…"
          className="field flex-1"
          disabled={pending}
        />
        <button type="submit" className="btn btn-primary sm:w-auto" disabled={pending || !question.trim()}>
          Ask
        </button>
      </form>

      <div ref={endRef} />
    </section>
  );
}
