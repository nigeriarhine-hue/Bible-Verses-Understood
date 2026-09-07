import { PATHS, type IconName } from './icon-paths';

interface IconProps {
  name: IconName;
  className?: string;
  /** Filled icons (bookmark-filled) paint rather than stroke. */
  title?: string;
}

export function Icon({ name, className = 'h-5 w-5', title }: IconProps) {
  const filled = name === 'bookmark-filled' || name === 'stop';
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
