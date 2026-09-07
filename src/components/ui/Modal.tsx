import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-[rgb(3_12_30/0.68)] backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="glass-strong relative max-h-[90svh] w-full max-w-lg animate-fade-up overflow-y-auto p-5 sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="display text-xl leading-tight">{title}</h2>
            {description ? <p className="mt-1.5 text-ui-sm muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1.5 rounded-xl p-1.5 muted transition hover:bg-white/10 hover:text-[rgb(var(--ink-on-dark))]"
          >
            <Icon name="close" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
