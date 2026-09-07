import { useId } from 'react';
import { Icon } from '../ui/Icon';
import type { Passage } from '../../lib/bible/types';

/**
 * The Scripture itself.
 *
 * Given a luminous light surface and a serif face so it is unmistakably
 * distinct from the commentary around it — Scripture is the text; everything
 * else on the page is commentary about it.
 */
export function ScriptureCard({
  passage,
  actions,
  showVerseNumbers = true,
}: {
  passage: Passage;
  actions?: React.ReactNode;
  showVerseNumbers?: boolean;
}) {
  const headingId = useId();
  const multiVerse = passage.verses.length > 1;

  return (
    <article className="glass-light overflow-hidden" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(12_27_46/0.1)] px-5 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h1 id={headingId} className="display text-[1.35rem] leading-tight text-[rgb(var(--ink-on-light))] sm:text-[1.6rem]">
            {passage.reference.reference}
          </h1>
          <p className="mt-0.5 text-ui-xs font-medium muted-on-light">
            {passage.translationName} ({passage.translation})
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className="scripture">
          {passage.verses.map((verse, index) => (
            <span key={`${verse.chapter}:${verse.verse}`}>
              {showVerseNumbers && multiVerse ? (
                <sup className="mr-1 align-super text-[0.7em] font-semibold text-[rgb(var(--gold-deep))]">
                  {verse.verse}
                </sup>
              ) : null}
              {verse.text}
              {index < passage.verses.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-start gap-2 border-t border-[rgb(12_27_46/0.1)] px-5 py-3 sm:px-6">
        <Icon name="book" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--ink-on-light-muted))]" />
        <p className="text-ui-xs leading-relaxed muted-on-light">
          Scripture text retrieved from the {passage.translationName}.
          {passage.copyright ? ` ${passage.copyright}` : ''}
        </p>
      </div>
    </article>
  );
}
