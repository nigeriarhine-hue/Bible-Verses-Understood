/**
 * POST /functions/v1/prewarm — scheduled, not public.
 *
 * Generates the day's explanation and devotional before anybody asks for them,
 * so the first reader of the morning gets a cache hit instead of waiting on
 * the model. Everything it writes goes into the same study_cache a reader
 * would have filled, produced by the same shared generator, so the entries are
 * byte-identical to what the request path would have made.
 *
 * It is deliberately small. It warms today's Verse of the Day and a short,
 * explicitly configured list of passages — never a crawl, never the whole
 * Bible, and never more generations in one run than MAX_GENERATIONS.
 *
 * Body: { references?: string[], translations?: string[] } — both optional and
 * both still subject to the cap.
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { hasGeminiKey } from '../_shared/gemini.ts';
import {
  GENERATED_MODE,
  generateDevotional,
  generateSimpleStudy,
} from '../_shared/generate.ts';
import {
  dailyReference,
  isoDate,
  parseCanonicalReference,
  publicDomainPassage,
  type ParsedReference,
} from '../_shared/daily.ts';
import { readStudyCache, studyCacheKey, writeStudyCache } from '../_shared/store.ts';

/**
 * The ceiling on one run, counted in Gemini calls.
 *
 * A prewarm that could grow without bound is a bill that can grow without
 * bound. Two per passage — the explanation and the devotional — so this is at
 * most a handful of passages a day.
 */
const MAX_GENERATIONS = 12;

/** The translation most readers are on, and the one warmed unless told otherwise. */
const DEFAULT_TRANSLATION = 'KJV';
const PUBLIC_DOMAIN = new Set(['KJV', 'BSB', 'ASV', 'YLT']);

interface Outcome {
  reference: string;
  translation: string;
  kind: 'study' | 'devotional';
  result: 'cached' | 'generated' | 'failed' | 'skipped';
}

/** Comma-separated secret, trimmed and de-duplicated. */
function listFrom(name: string): string[] {
  return [
    ...new Set(
      (Deno.env.get(name) ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Only a caller holding the shared secret may spend money here.
 *
 * Compared in full rather than short-circuiting on the first wrong character,
 * and a missing secret refuses everything: an endpoint that generates on demand
 * must not be reachable by anyone who finds the URL.
 */
function authorised(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET')?.trim() ?? '';
  if (!expected) return false;
  const offered = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (offered.length !== expected.length) return false;
  let same = 0;
  for (let i = 0; i < expected.length; i += 1) same |= offered.charCodeAt(i) ^ expected.charCodeAt(i);
  return same === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);
  if (!authorised(req)) return failure(req, 'Not authorised.', 401);
  if (!hasGeminiKey()) {
    return failure(req, 'The commentary service is not configured.', 503, {
      code: 'commentary_not_configured',
    });
  }

  let body: { references?: unknown; translations?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is the normal scheduled case.
  }

  const asked = Array.isArray(body.references)
    ? (body.references as unknown[]).map((r) => String(r).trim()).filter(Boolean)
    : [];
  const configured = listFrom('PREWARM_REFERENCES');

  const today = await dailyReference();
  const references: ParsedReference[] = [];
  const seen = new Set<string>();
  for (const candidate of [today, ...[...asked, ...configured].map(parseCanonicalReference)]) {
    if (candidate && !seen.has(candidate.reference)) {
      seen.add(candidate.reference);
      references.push(candidate);
    }
  }

  const translations = (
    Array.isArray(body.translations)
      ? (body.translations as unknown[]).map((t) => String(t).trim().toUpperCase())
      : listFrom('PREWARM_TRANSLATIONS').map((t) => t.toUpperCase())
  ).filter((t) => PUBLIC_DOMAIN.has(t));
  if (translations.length === 0) translations.push(DEFAULT_TRANSLATION);

  const outcomes: Outcome[] = [];
  let generations = 0;

  for (const reference of references) {
    for (const translation of translations) {
      if (generations >= MAX_GENERATIONS) {
        outcomes.push({ reference: reference.reference, translation, kind: 'study', result: 'skipped' });
        continue;
      }

      const passage = await publicDomainPassage(reference, translation);
      if (!passage) {
        outcomes.push({ reference: reference.reference, translation, kind: 'study', result: 'failed' });
        continue;
      }

      // The Verse of the Day gets a devotional too; a configured passage does
      // not, because nothing shows a devotional for one.
      const wanted: Array<Outcome['kind']> =
        reference.reference === today?.reference ? ['study', 'devotional'] : ['study'];

      for (const kind of wanted) {
        if (generations >= MAX_GENERATIONS) {
          outcomes.push({ reference: passage.reference, translation, kind, result: 'skipped' });
          continue;
        }
        const mode = kind === 'study' ? GENERATED_MODE : 'devotional';
        const cacheKey = await studyCacheKey(passage.reference, translation, mode, passage.text);

        if (await readStudyCache(cacheKey)) {
          outcomes.push({ reference: passage.reference, translation, kind, result: 'cached' });
          continue;
        }

        try {
          const generated =
            kind === 'study'
              ? await generateSimpleStudy(passage.reference, translation, passage.text)
              : await generateDevotional(passage.reference, translation, passage.text);
          await writeStudyCache(cacheKey, passage.reference, translation, mode, generated);
          generations += 1;
          outcomes.push({ reference: passage.reference, translation, kind, result: 'generated' });
        } catch (error) {
          // A failure here is never a reader's problem — nobody is waiting.
          console.error(
            `prewarm could not generate the ${kind} for ${passage.reference} (${translation}):`,
            error instanceof Error ? error.message : 'unknown error',
          );
          outcomes.push({ reference: passage.reference, translation, kind, result: 'failed' });
        }
      }
    }
  }

  const summary = {
    date: isoDate(),
    verseOfTheDay: today?.reference ?? null,
    generations,
    limit: MAX_GENERATIONS,
    outcomes,
  };
  console.log('prewarm:', JSON.stringify({ ...summary, outcomes: outcomes.length }));
  return json(req, summary);
});
