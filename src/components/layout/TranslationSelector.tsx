import { useEffect, useId, useRef, useState } from 'react';
import { usePreferences } from '../../context/PreferencesContext';
import { Icon } from '../ui/Icon';

/**
 * The global translation control.
 *
 * Changing it here keeps the reader exactly where they are — same passage, same
 * explanation mode, same trail — and re-fetches the text in the new version.
 * Only translations we can legally serve are selectable; the rest are listed
 * as unavailable rather than hidden, so the reader can see what is coming.
 */
export function TranslationSelector({ variant = 'header' }: { variant?: 'header' | 'block' }) {
  const { translation, translations, availableTranslations, setTranslation } = usePreferences();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unavailable = translations.filter((t) => !t.isAvailable);

  return (
    <div ref={containerRef} className={variant === 'block' ? 'relative w-full' : 'relative'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        className={
          variant === 'block'
            ? 'btn btn-secondary w-full justify-between'
            : 'btn btn-secondary px-4 py-2'
        }
      >
        <span className="sr-only">Bible translation:</span>
        <span className="font-semibold tracking-wide">{translation}</span>
        <Icon name="chevron-down" className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Choose a Bible translation"
          className={
            // In the mobile menu the list expands inline, so a scrollable
            // container cannot clip it. In the header it floats as a dropdown.
            variant === 'block'
              ? 'glass-strong mt-2 w-full p-2'
              : 'glass-strong absolute right-0 z-50 mt-2 max-h-[min(70vh,32rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-2'
          }
        >
          <p className="px-3 pb-2 pt-1 text-ui-xs font-semibold uppercase tracking-wider muted">
            Available now
          </p>
          {availableTranslations.map((entry) => (
            <button
              key={entry.abbreviation}
              type="button"
              role="option"
              aria-selected={entry.abbreviation === translation}
              onClick={() => {
                setTranslation(entry.abbreviation);
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10 ${
                entry.abbreviation === translation ? 'bg-white/10' : ''
              }`}
            >
              <span className="mt-0.5 w-14 shrink-0 text-ui-sm font-bold tracking-wide">
                {entry.abbreviation}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ui-sm">{entry.name}</span>
                {entry.isPublicDomain ? (
                  <span className="block text-ui-xs muted">Public domain</span>
                ) : null}
              </span>
              {entry.abbreviation === translation ? (
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--gold))]" />
              ) : null}
            </button>
          ))}

          {unavailable.length > 0 ? (
            <>
              <p className="mt-3 border-t border-white/10 px-3 pb-2 pt-3 text-ui-xs font-semibold uppercase tracking-wider muted">
                Awaiting licensed access
              </p>
              <ul className="px-3 pb-2">
                {unavailable.map((entry) => (
                  <li
                    key={entry.abbreviation}
                    className="flex items-baseline gap-3 py-1 text-ui-xs muted"
                  >
                    <span className="w-14 shrink-0 font-semibold tracking-wide">{entry.abbreviation}</span>
                    <span className="min-w-0 flex-1">{entry.name}</span>
                  </li>
                ))}
              </ul>
              <p className="px-3 pb-2 text-ui-xs muted">
                These require a licence from their publishers. They will appear here once authorised
                access is configured.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
