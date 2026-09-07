import { Icon } from '../ui/Icon';

/** Play or stop text-to-speech. Nothing ever plays on its own. */
export function AudioButton({
  active,
  onToggle,
  label = 'Listen',
  tone = 'light',
}: {
  active: boolean;
  onToggle: () => void;
  label?: string;
  tone?: 'light' | 'dark';
}) {
  const buttonClass = tone === 'light' ? 'btn btn-on-light min-h-0 px-3.5 py-2' : 'btn btn-secondary min-h-0 px-3.5 py-2';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${buttonClass} text-ui-xs`}
      aria-pressed={active}
    >
      <Icon name={active ? 'stop' : 'speaker'} className="h-4 w-4" />
      {active ? 'Stop' : label}
    </button>
  );
}
