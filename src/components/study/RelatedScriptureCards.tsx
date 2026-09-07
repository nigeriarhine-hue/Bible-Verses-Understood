import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../../lib/analytics';
import { parseReference, referenceToPath } from '../../lib/bible/reference';
import { getPassage } from '../../lib/bible/provider';
import type { BibleReference } from '../../lib/bible/types';
import type { RelatedScripture } from '../../lib/ai/types';
import { Icon } from '../ui/Icon';

interface ValidatedRelated {
  suggestion: RelatedScripture;
  reference: BibleReference;
  preview: string | null;
}

/**
 * Related Scripture, as cards a reader can walk into.
 *
 * Every suggestion is retrieved from the Bible before it is rendered — a
 * reference that does not resolve to real text is dropped rather than shown as
 * a link to nowhere. The preview is the actual Scripture, never a paraphrase.
 */
export function RelatedScriptureCards({
  related,
  translation,
  fromReference,
  onNavigate,
}: {
  related: RelatedScripture[];
  translation: string;
  fromReference: string;
  onNavigate?: (reference: string) => void;
}) {
  const [validated, setValidated] = useState<ValidatedRelated[]>([]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    setChecking(true);

    Promise.all(
      related.map(async (suggestion) => {
        const reference = parseReference(suggestion.reference, { strict: true });
        if (!reference) return null;
        try {
          const passage = await getPassage(reference, translation);
          return {
            suggestion,
            reference: passage.reference,
            preview: passage.text.length > 0 ? passage.text : null,
          } satisfies ValidatedRelated;
        } catch {
          // The reference did not resolve to Scripture we can show — drop it.
          return null;
        }
      }),
    ).then((results) => {
      if (!active) return;
      setValidated(results.filter((item): item is ValidatedRelated => item !== null));
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [related, translation]);

  if (checking && validated.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {related.slice(0, 4).map((item) => (
          <div key={item.reference} className="glass h-36 p-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-3 w-full" />
            <div className="skeleton mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  if (validated.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {validated.map(({ suggestion, reference, preview }) => (
        <li key={reference.reference}>
          <Link
            to={referenceToPath(reference)}
            state={{ source: 'related_scripture', from: fromReference }}
            onClick={() => {
              trackEvent('related_scripture_click', {
                reference: reference.reference,
                from: fromReference,
                placement: 'card',
              });
              onNavigate?.(reference.reference);
            }}
            className="glass group flex h-full flex-col gap-2.5 p-4 transition hover:border-white/35 hover:shadow-lift focus-visible:border-white/45"
          >
            <span className="display text-[1.0625rem] text-[rgb(var(--gold))]">
              {reference.reference}
            </span>

            {preview ? (
              <span className="glass-light block rounded-xl px-3 py-2.5">
                <span className="block font-serif text-[0.95rem] leading-[1.6rem] text-[rgb(var(--ink-on-light))]">
                  “{shorten(preview, 150)}”
                </span>
              </span>
            ) : null}

            <span className="text-ui-sm leading-relaxed muted">{suggestion.relevanceExplanation}</span>

            <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-ui-sm font-semibold text-[rgb(var(--gold))]">
              Understand This Verse
              <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit);
  return `${text.slice(0, cut > 0 ? cut : limit)}…`;
}
