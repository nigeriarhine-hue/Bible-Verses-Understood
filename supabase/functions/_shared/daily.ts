/**
 * Today's verse, and the Scripture text for it, on the server side.
 *
 * Two jobs need this without a browser: the prewarm that generates the day's
 * explanation before anyone asks, and the daily email. Both want the same
 * verse the site shows, and both want text they are allowed to redistribute.
 */
import { BOOKS } from './books.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * The public site, which is also where the bundled Scripture files are served
 * from. Set SITE_URL as a secret; it is the same value the frontend uses.
 */
export function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'https://bible-verses-understood.vercel.app').replace(/\/$/, '');
}

/**
 * The translation used anywhere text leaves the site — email, most of all.
 *
 * Public domain by default and by policy. A licence to *display* a translation
 * on a website is not a licence to redistribute it by email, and the four
 * bundled translations are the ones with no such question hanging over them.
 * EMAIL_TRANSLATION can name a different one, but only from this list.
 */
const PUBLIC_DOMAIN = new Set(['KJV', 'BSB', 'ASV', 'YLT']);

export function emailTranslation(): string {
  const wanted = (Deno.env.get('EMAIL_TRANSLATION') ?? '').trim().toUpperCase();
  if (wanted && !PUBLIC_DOMAIN.has(wanted)) {
    console.warn(
      `EMAIL_TRANSLATION is set to ${wanted}, which is not one of the public-domain ` +
        'translations this app may redistribute; using KJV.',
    );
    return 'KJV';
  }
  return wanted || 'KJV';
}

/** A reference broken into the parts needed to pull its text. */
export interface ParsedReference {
  reference: string;
  bookId: string;
  bookName: string;
  chapter: number;
  startVerse: number | null;
  endVerse: number | null;
}

const BY_NAME = new Map(BOOKS.map((b) => [b.name.toLowerCase(), b]));

/**
 * Parses the canonical form the app stores, e.g. "1 Corinthians 13:4-7".
 *
 * Deliberately narrow: these references come from the app's own tables and
 * pool, already normalised. Anything else is refused rather than guessed at.
 */
export function parseCanonicalReference(raw: string): ParsedReference | null {
  const match = /^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(raw.trim());
  if (!match) return null;
  const book = BY_NAME.get(match[1].trim().toLowerCase());
  if (!book) return null;

  const chapter = Number(match[2]);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null;

  const startVerse = match[3] ? Number(match[3]) : null;
  const endVerse = match[4] ? Number(match[4]) : null;
  if (startVerse !== null && (!Number.isInteger(startVerse) || startVerse < 1)) return null;
  if (endVerse !== null && (!Number.isInteger(endVerse) || endVerse < startVerse!)) return null;

  return {
    reference: raw.trim(),
    bookId: book.id,
    bookName: book.name,
    chapter,
    startVerse,
    endVerse,
  };
}

/** The date as the app writes it: YYYY-MM-DD in UTC. */
export function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The Verse of the Day.
 *
 * The daily_verses table is the editor's choice and wins. With no row for
 * today, the caller decides what to do — this does not invent one, because a
 * job that silently emails a different verse from the site would be worse than
 * a job that does nothing.
 */
export async function dailyReference(day = isoDate()): Promise<ParsedReference | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_verses?verse_date=eq.${day}&select=reference&limit=1`,
      {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ reference: string }>;
    const reference = rows[0]?.reference;
    return reference ? parseCanonicalReference(reference) : null;
  } catch {
    return null;
  }
}

export interface PassageText {
  reference: string;
  translation: string;
  text: string;
}

/**
 * The text of a passage, from the same public-domain files the site serves.
 *
 * Read over HTTP rather than bundled into the function: 31,102 verses in four
 * translations do not belong in an Edge Function, and these files are already
 * public, cached at the edge and versioned with the deployment.
 */
export async function publicDomainPassage(
  parsed: ParsedReference,
  translation = emailTranslation(),
): Promise<PassageText | null> {
  try {
    const res = await fetch(`${siteUrl()}/scripture/${translation}/${parsed.bookId}.json`);
    if (!res.ok) return null;
    const book = (await res.json()) as { chapters: string[][] };
    const verses = book.chapters?.[parsed.chapter - 1];
    if (!verses?.length) return null;

    const from = parsed.startVerse ?? 1;
    const to = parsed.endVerse ?? parsed.startVerse ?? verses.length;
    const slice = verses.slice(from - 1, to);
    if (!slice.length) return null;

    return {
      reference: parsed.reference,
      translation,
      text: slice.join(' ').replace(/\s+/g, ' ').trim(),
    };
  } catch {
    return null;
  }
}
