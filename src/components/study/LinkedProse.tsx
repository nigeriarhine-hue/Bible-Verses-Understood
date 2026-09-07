import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../../lib/analytics';
import { findReferencesInText, referenceToPath } from '../../lib/bible/reference';

/**
 * Renders a block of commentary with every Scripture reference inside it turned
 * into a link.
 *
 * References are matched against the canon first — a citation that does not
 * resolve to a real book, chapter and verse is left as plain text rather than
 * linked to a page that cannot exist.
 */
export function LinkedProse({
  text,
  className = '',
  onLinkClick,
  tone = 'dark',
}: {
  text: string;
  className?: string;
  onLinkClick?: (reference: string) => void;
  tone?: 'dark' | 'light';
}) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={index > 0 ? 'mt-4' : undefined}>
          {linkify(paragraph, tone, onLinkClick)}
        </p>
      ))}
    </div>
  );
}

/** Same linking, but inline — for a single line rather than a block. */
export function LinkedText({
  text,
  tone = 'dark',
  onLinkClick,
}: {
  text: string;
  tone?: 'dark' | 'light';
  onLinkClick?: (reference: string) => void;
}) {
  return <>{linkify(text, tone, onLinkClick)}</>;
}

function linkify(
  text: string,
  tone: 'dark' | 'light',
  onLinkClick?: (reference: string) => void,
): ReactNode[] {
  const matches = findReferencesInText(text);
  if (matches.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const [index, match] of matches.entries()) {
    if (match.start < cursor) continue; // overlapping match — skip
    if (match.start > cursor) nodes.push(text.slice(cursor, match.start));
    nodes.push(
      <Link
        key={`${match.reference.reference}-${index}`}
        to={referenceToPath(match.reference)}
        state={{ source: 'related_scripture' }}
        className={`ref-link ${tone === 'light' ? 'ref-link-on-light' : ''}`}
        onClick={() => {
          trackEvent('related_scripture_click', {
            reference: match.reference.reference,
            placement: 'inline',
          });
          onLinkClick?.(match.reference.reference);
        }}
      >
        {match.raw}
      </Link>,
    );
    cursor = match.end;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
