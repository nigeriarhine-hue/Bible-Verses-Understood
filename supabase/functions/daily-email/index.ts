/**
 * POST /functions/v1/daily-email — scheduled, not public.
 *
 * Sends one email to everyone who asked for it: the Verse of the Day, a short
 * excerpt of that day's general devotional, and a link to read the rest.
 *
 * THE COST RULE. One devotional is generated for the day and reused for every
 * recipient. The run reads the shared study_cache first — the prewarm has
 * usually filled it already — and only if it is empty does it generate once
 * and write it back. A personalised devotional is never used here: it is
 * written about one reader and belongs to them alone.
 *
 * Idempotency is the database's, not this function's. Every recipient is
 * claimed by inserting into daily_email_sends, whose unique key is
 * (send_date, subscription_id). A second run of the same day claims nobody and
 * therefore sends nothing.
 *
 * Body: { date?: 'YYYY-MM-DD', limit?: number, dryRun?: true }
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { GeminiError, hasGeminiKey } from '../_shared/gemini.ts';
import { generateDevotional, type DevotionalResponse } from '../_shared/generate.ts';
import {
  dailyReference,
  emailTranslation,
  isoDate,
  publicDomainPassage,
  siteUrl,
} from '../_shared/daily.ts';
import {
  BATCH_SIZE,
  dailyEmailHtml,
  dailyEmailText,
  derivedToken,
  excerpt,
  hasResendKey,
  sendBatch,
  type DailyEmailContent,
  type Message,
} from '../_shared/email.ts';
import { readStudyCache, serviceFetch, serviceRows, studyCacheKey, writeStudyCache } from '../_shared/store.ts';

/** The copyright line that travels with the text. */
const NOTICES: Record<string, string> = {
  KJV: 'King James Version (1769). Public domain in the United States and most of the world; Crown copyright in the United Kingdom.',
  BSB: 'Berean Standard Bible. Dedicated to the public domain by the Berean Bible translation committee and Bible Hub.',
  ASV: 'American Standard Version (1901). Public domain.',
  YLT: 'Young’s Literal Translation (1898). Public domain.',
};

/** Enough failed mornings to stop trying an address for good. */
const SUPPRESS_AFTER = 3;

interface Subscriber {
  id: string;
  email: string;
  email_normalised: string;
  failure_count: number;
}

function authorised(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET')?.trim() ?? '';
  if (!expected) return false;
  const offered = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (offered.length !== expected.length) return false;
  let same = 0;
  for (let i = 0; i < expected.length; i += 1) same |= offered.charCodeAt(i) ^ expected.charCodeAt(i);
  return same === 0;
}

/**
 * The day's general devotional: cached if it exists, generated once if not.
 *
 * This is the whole cost story. Whether there are five subscribers or fifty
 * thousand, Gemini is called at most once — and usually not at all, because
 * the prewarm ran first.
 */
async function devotionalForToday(
  reference: string,
  translation: string,
  scriptureText: string,
): Promise<{ devotional: DevotionalResponse; generated: boolean } | null> {
  const cacheKey = await studyCacheKey(reference, translation, 'devotional', scriptureText);
  const cached = await readStudyCache<DevotionalResponse>(cacheKey);
  if (cached) return { devotional: cached, generated: false };

  if (!hasGeminiKey()) return null;
  try {
    const devotional = await generateDevotional(reference, translation, scriptureText);
    await writeStudyCache(cacheKey, reference, translation, 'devotional', devotional);
    return { devotional, generated: true };
  } catch (error) {
    console.error(
      'daily-email could not produce the devotional:',
      error instanceof GeminiError ? error.message : 'generation failed',
    );
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);
  if (!authorised(req)) return failure(req, 'Not authorised.', 401);
  if (!hasResendKey()) {
    return failure(req, 'RESEND_API_KEY is not set.', 503, { code: 'email_not_configured' });
  }

  let body: { date?: unknown; limit?: unknown; dryRun?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is the normal scheduled case.
  }

  const day = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : isoDate();
  const dryRun = body.dryRun === true;
  const cap = Number.isInteger(body.limit) ? Math.max(0, body.limit as number) : Infinity;

  const reference = await dailyReference(day);
  if (!reference) {
    // Better to send nothing than to send a different verse from the site.
    await recordRun(day, { note: 'no verse of the day for this date' });
    return failure(req, `No Verse of the Day is set for ${day}.`, 409, { code: 'no_verse' });
  }

  const translation = emailTranslation();
  const passage = await publicDomainPassage(reference, translation);
  if (!passage) {
    await recordRun(day, { reference: reference.reference, translation, note: 'scripture unavailable' });
    return failure(req, 'The Scripture for that passage could not be read.', 502);
  }

  const produced = await devotionalForToday(reference.reference, translation, passage.text);
  if (!produced) {
    await recordRun(day, { reference: reference.reference, translation, note: 'devotional unavailable' });
    return failure(req, "Today's devotional is not available.", 502);
  }

  const content = {
    date: day,
    reference: reference.reference,
    translation,
    scriptureText: passage.text,
    copyrightNotice: NOTICES[translation] ?? 'Public domain.',
    devotionalTitle: produced.devotional.title,
    devotionalExcerpt: excerpt(produced.devotional.sections[0]?.body ?? ''),
    readUrl: `${siteUrl()}/daily`,
  };

  // Confirmed, still subscribed, never permanently failed.
  const subscribers = await serviceRows<Subscriber>(
    'daily_email_subscriptions?is_subscribed=eq.true&suppressed_at=is.null' +
      '&confirmed_at=not.is.null&select=id,email,email_normalised,failure_count&order=created_at.asc',
  );

  let sent = 0;
  let failed = 0;
  let claimed = 0;

  for (let start = 0; start < subscribers.length && claimed < cap; start += BATCH_SIZE) {
    const batch = subscribers.slice(start, start + Math.min(BATCH_SIZE, cap - claimed));

    // Claiming is the idempotency: only rows that did not already exist for
    // today come back, so a re-run of the same day claims — and sends — none.
    const claimRes = await serviceFetch('daily_email_sends?on_conflict=send_date,subscription_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(
        batch.map((s) => ({ send_date: day, subscription_id: s.id, status: 'claimed' })),
      ),
    });
    if (!claimRes?.ok) {
      console.error('daily-email could not claim a batch:', claimRes?.status ?? 'no response');
      break;
    }
    const claims = (await claimRes.json()) as Array<{ id: string; subscription_id: string }>;
    if (claims.length === 0) continue;

    const byId = new Map(batch.map((s) => [s.id, s]));
    const recipients = claims
      .map((claim) => ({ claim, subscriber: byId.get(claim.subscription_id) }))
      .filter((entry): entry is { claim: typeof claims[number]; subscriber: Subscriber } =>
        Boolean(entry.subscriber),
      );
    claimed += recipients.length;

    const messages: Message[] = [];
    for (const { subscriber } of recipients) {
      const token = await derivedToken(subscriber.id, subscriber.email_normalised);
      const unsubscribe =
        `${Deno.env.get('FUNCTIONS_PUBLIC_URL') ?? `${siteUrl()}/functions/v1`}` +
        `/email-subscription?action=unsubscribe&id=${subscriber.id}&token=${token}`;
      const full: DailyEmailContent = { ...content, unsubscribeUrl: unsubscribe };
      messages.push({
        to: subscriber.email,
        subject: `${content.reference} — today’s verse`,
        html: dailyEmailHtml(full),
        text: dailyEmailText(full),
        unsubscribeUrl: unsubscribe,
      });
    }

    if (dryRun) {
      // Release the claims so a real run can still go out today.
      await serviceFetch(
        `daily_email_sends?send_date=eq.${day}&subscription_id=in.(${recipients
          .map((r) => r.subscriber.id)
          .join(',')})`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
      );
      continue;
    }

    const results = await sendBatch(messages);
    for (let i = 0; i < recipients.length; i += 1) {
      const { claim, subscriber } = recipients[i];
      const result = results[i] ?? { ok: false, error: 'no result' };
      if (result.ok) {
        sent += 1;
        await serviceFetch(`daily_email_sends?id=eq.${claim.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'sent', provider_message_id: result.id ?? null }),
        });
        if (subscriber.failure_count > 0) {
          await serviceFetch(`daily_email_subscriptions?id=eq.${subscriber.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ failure_count: 0 }),
          });
        }
        continue;
      }

      failed += 1;
      await serviceFetch(`daily_email_sends?id=eq.${claim.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        // Truncated, and never the address: enough to trace, no more.
        body: JSON.stringify({ status: 'failed', error: (result.error ?? '').slice(0, 200) }),
      });

      const failures = subscriber.failure_count + 1;
      const suppress = result.permanent === true || failures >= SUPPRESS_AFTER;
      await serviceFetch(`daily_email_subscriptions?id=eq.${subscriber.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          failure_count: failures,
          ...(suppress
            ? {
                suppressed_at: new Date().toISOString(),
                suppression_reason: result.permanent ? 'rejected by the provider' : 'repeated failures',
              }
            : {}),
        }),
      });
    }
  }

  await recordRun(day, {
    reference: reference.reference,
    translation,
    recipients: claimed,
    sent,
    failed,
    ...(dryRun ? { note: 'dry run — nothing was sent' } : {}),
  });

  const summary = {
    date: day,
    reference: reference.reference,
    translation,
    subscribers: subscribers.length,
    recipients: claimed,
    sent,
    failed,
    devotionalGenerated: produced.generated,
    dryRun,
  };
  console.log('daily-email:', JSON.stringify(summary));
  return json(req, summary);
});

/** Counts only. No addresses, no Scripture, no devotional text. */
async function recordRun(day: string, fields: Record<string, unknown>): Promise<void> {
  await serviceFetch('daily_email_runs?on_conflict=send_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ send_date: day, finished_at: new Date().toISOString(), ...fields }),
  });
}
