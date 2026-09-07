import { GA_MEASUREMENT_ID } from './env';

/**
 * Google Analytics 4.
 *
 * The gtag snippet is installed once in index.html with `send_page_view: false`
 * so a single-page navigation produces exactly one page_view — sent from here
 * on each route change, not from every component that renders.
 *
 * Privacy rule for this app: nothing a reader types about their own life, and
 * no conversation content, is ever sent here. Event parameters carry
 * references, translations and modes only.
 */

type GtagArgs =
  | ['js', Date]
  | ['config', string, Record<string, unknown>?]
  | ['event', string, Record<string, unknown>?];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

export type AnalyticsEvent =
  | 'verse_search'
  | 'verse_view'
  | 'related_scripture_click'
  | 'bible_version_change'
  | 'explanation_mode_change'
  | 'topic_selected'
  | 'devotional_view'
  | 'verse_saved'
  | 'verse_shared'
  | 'audio_play'
  | 'account_signup'
  | 'collection_created';

function gtag(...args: GtagArgs): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag(...args);
}

/** Sends one page_view for a client-side navigation. */
export function trackPageView(path: string, title?: string): void {
  gtag('config', GA_MEASUREMENT_ID, {
    page_path: path,
    page_location: currentHref(),
    page_title: title,
    send_page_view: true,
  });
}

function currentHref(): string | undefined {
  try {
    return window.location?.href;
  } catch {
    return undefined;
  }
}

/**
 * Sends a named event.
 *
 * Parameter values are truncated and free text is refused: a life-situation
 * description or a follow-up question must never end up in analytics.
 */
export function trackEvent(name: AnalyticsEvent, params: Record<string, string | number | boolean> = {}): void {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    safe[key] = typeof value === 'string' ? value.slice(0, 100) : value;
  }
  gtag('event', name, safe);
}
