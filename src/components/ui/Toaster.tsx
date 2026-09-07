import { useToast } from '../../context/ToastContext';
import { Icon } from './Icon';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="glass-strong pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-3 px-4 py-3"
        >
          <Icon
            name={toast.tone === 'error' ? 'info' : toast.tone === 'success' ? 'check' : 'sparkle'}
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              toast.tone === 'error' ? 'text-[#ffb4a8]' : 'text-[rgb(var(--gold))]'
            }`}
          />
          <p className="flex-1 text-ui-sm leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="-m-1 rounded-lg p-1 muted transition hover:text-[rgb(var(--ink-on-dark))]"
          >
            <Icon name="close" className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      ))}
    </div>
  );
}
