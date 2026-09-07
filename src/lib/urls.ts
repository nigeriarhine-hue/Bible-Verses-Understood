import { SITE_URL } from './env';

/**
 * URL construction, in one place.
 *
 * No component names a domain. Changing where the app lives means changing
 * VITE_SITE_URL and the Supabase redirect allow-list, and nothing else.
 */

/** An absolute URL on the site's public origin, for sharing and metadata. */
export function absoluteUrl(path: string): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalised}`;
}

/**
 * Where Supabase should send a reader back to after an email link or an OAuth
 * round trip.
 *
 * This deliberately uses the origin the reader is actually on rather than
 * VITE_SITE_URL: someone signing up on localhost must come back to localhost,
 * and a preview deployment must come back to itself. Supabase's redirect
 * allow-list is what decides which of those origins are permitted, so that
 * list needs the production URL and the local dev URL in it.
 */
export function authRedirectUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${origin.replace(/\/$/, '')}${normalised}`;
}

/** The canonical URL for the page currently being viewed. */
export function canonicalUrl(pathname: string, search = ''): string {
  // Query strings are view state, not identity — they stay out of the canonical.
  void search;
  return absoluteUrl(pathname);
}
