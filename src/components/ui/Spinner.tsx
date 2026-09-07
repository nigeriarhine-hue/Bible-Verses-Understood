export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A calm loading state for a panel that is about to fill with text. */
export function LoadingLines({ lines = 4, label }: { lines?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {label ? <span className="sr-only">{label}</span> : null}
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-4"
          style={{ width: `${[100, 96, 92, 85, 78][index % 5]}%` }}
        />
      ))}
    </div>
  );
}
