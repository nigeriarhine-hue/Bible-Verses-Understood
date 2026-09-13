/**
 * /functions/v1/email-subscription
 *
 * Everything a reader does with the daily email: asking for it, confirming an
 * address, and stopping it.
 *
 * Nobody is subscribed by creating an account, and nobody is subscribed by
 * somebody else typing their address. A guest's address gets one confirmation
 * email and nothing else until they click the link in it. A signed-in reader's
 * address is already verified by Supabase Auth, so theirs takes effect at once.
 *
 * POST { action: 'subscribe', email }      — guest or reader, starts the opt-in
 * POST { action: 'status' }                — signed-in: am I subscribed?
 * POST { action: 'set', subscribed }       — signed-in: turn it on or off
 * GET  ?action=confirm&id=&token=          — from the confirmation email
 * GET  ?action=unsubscribe&id=&token=      — from the footer of every email
 */
import { failure, json, preflight } from '../_shared/cors.ts';
import { siteUrl } from '../_shared/daily.ts';
import {
  confirmationEmailHtml,
  confirmationEmailText,
  derivedToken,
  hasResendKey,
  randomToken,
  sendOne,
  tokenDigest,
  tokensMatch,
} from '../_shared/email.ts';
import { callerKey, callerUserId, isRateLimited, serviceFetch, serviceRows } from '../_shared/store.ts';

interface Subscription {
  id: string;
  user_id: string | null;
  email: string;
  email_normalised: string;
  is_subscribed: boolean;
  confirmed_at: string | null;
  confirmation_token_hash: string | null;
  unsubscribe_token_hash: string;
  suppressed_at: string | null;
}

/** Deliberately plain: enough to catch a typo, not a spec-complete parser. */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
const MAX_EMAIL_CHARS = 254;

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

function confirmUrl(id: string, token: string): string {
  const base = Deno.env.get('FUNCTIONS_PUBLIC_URL') ?? `${siteUrl()}/functions/v1`;
  return `${base}/email-subscription?action=confirm&id=${id}&token=${token}`;
}

/** A small branded page, because these links are opened in a browser. */
function page(title: string, message: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#0c1b2e;color:#f4f1ea;font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:56px 20px;">
  <p style="margin:0 0 28px;font:600 17px/1.3 Georgia,'Times New Roman',serif;color:#e8b64c;">Bible Verses Understood</p>
  <div style="background:#132741;border-radius:14px;padding:26px;">
    <h1 style="margin:0 0 12px;font:600 22px/1.3 Georgia,'Times New Roman',serif;">${title}</h1>
    <p style="margin:0 0 22px;color:#dfe6ef;">${message}</p>
    <a href="${siteUrl()}" style="display:inline-block;background:#e8b64c;color:#241701;border-radius:10px;padding:12px 20px;font-weight:600;text-decoration:none;">
      Open Bible Verses Understood
    </a>
  </div>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function findById(id: string): Promise<Subscription | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await serviceRows<Subscription>(
    `daily_email_subscriptions?id=eq.${id}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

async function patch(id: string, changes: Record<string, unknown>): Promise<boolean> {
  const res = await serviceFetch(`daily_email_subscriptions?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(changes),
  });
  return Boolean(res?.ok);
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  /* ---- Links from an email ------------------------------------------- */
  if (req.method === 'GET') {
    const id = url.searchParams.get('id') ?? '';
    const token = url.searchParams.get('token') ?? '';
    const row = await findById(id);

    if (!row || !token) {
      return page('That link is not valid', 'It may have already been used, or been cut short by an email client.', 400);
    }

    if (action === 'unsubscribe') {
      const expected = await derivedToken(row.id, row.email_normalised);
      if (!tokensMatch(token, expected)) {
        return page('That link is not valid', 'It may have already been used, or been cut short by an email client.', 400);
      }
      if (!row.is_subscribed) {
        return page('You are unsubscribed', 'This address was already off the list. Nothing more will be sent.');
      }
      await patch(row.id, {
        is_subscribed: false,
        unsubscribed_at: new Date().toISOString(),
      });
      return page(
        'You are unsubscribed',
        'The daily verse will stop. Everything on the site stays open to you, and you can turn it back on any time from your profile.',
      );
    }

    if (action === 'confirm') {
      if (!row.confirmation_token_hash) {
        return page(
          row.is_subscribed ? 'Already confirmed' : 'That link is not valid',
          row.is_subscribed
            ? 'This address is confirmed. The next Verse of the Day is on its way.'
            : 'It may have already been used. Ask for the email again from the site.',
          row.is_subscribed ? 200 : 400,
        );
      }
      const digest = await tokenDigest(token);
      if (!tokensMatch(digest, row.confirmation_token_hash)) {
        return page('That link is not valid', 'It may have already been used, or been cut short by an email client.', 400);
      }
      const now = new Date().toISOString();
      // The token is cleared, so the link works exactly once.
      await patch(row.id, {
        is_subscribed: true,
        confirmed_at: now,
        subscribed_at: now,
        unsubscribed_at: null,
        confirmation_token_hash: null,
        suppressed_at: null,
        suppression_reason: null,
        failure_count: 0,
      });
      return page(
        'You are subscribed',
        'The Verse of the Day and a short devotional will arrive once a day. Every email has an unsubscribe link.',
      );
    }

    return page('Nothing to do here', 'This address handles links from the daily email.', 400);
  }

  if (req.method !== 'POST') return failure(req, 'Use POST.', 405);
  if (isRateLimited(`email-subscription:${callerKey(req)}`, 10)) {
    return failure(req, 'Too many requests. Please wait a moment and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure(req, 'Expected a JSON body.');
  }

  const userId = await callerUserId(req);

  /* ---- What a signed-in reader currently has --------------------------- */
  if (body.action === 'status') {
    if (!userId) return failure(req, 'Sign in to manage the daily email.', 401);
    const rows = await serviceRows<Subscription>(
      `daily_email_subscriptions?user_id=eq.${userId}&select=email,is_subscribed,confirmed_at,suppressed_at&limit=1`,
    );
    const row = rows[0];
    return json(req, {
      subscribed: Boolean(row?.is_subscribed),
      email: row?.email ?? null,
      pending: Boolean(row && !row.confirmed_at),
      suppressed: Boolean(row?.suppressed_at),
    });
  }

  /* ---- A signed-in reader turning it on or off ------------------------- */
  if (body.action === 'set') {
    if (!userId) return failure(req, 'Sign in to manage the daily email.', 401);
    const wanted = body.subscribed === true;
    const email = String(body.email ?? '').trim();
    const normalised = normalise(email);

    const existing = (
      await serviceRows<Subscription>(
        `daily_email_subscriptions?user_id=eq.${userId}&select=*&limit=1`,
      )
    )[0];

    if (existing) {
      const now = new Date().toISOString();
      await patch(existing.id, {
        is_subscribed: wanted,
        ...(wanted
          ? { subscribed_at: now, unsubscribed_at: null, suppressed_at: null, suppression_reason: null, failure_count: 0 }
          : { unsubscribed_at: now }),
      });
      return json(req, { subscribed: wanted, email: existing.email, pending: false });
    }

    if (!wanted) return json(req, { subscribed: false, email: null, pending: false });
    if (!email || !EMAIL.test(email) || email.length > MAX_EMAIL_CHARS) {
      return failure(req, 'That does not look like an email address.');
    }

    // An account's address is already verified by Supabase Auth, so a reader
    // does not have to confirm it a second time.
    const now = new Date().toISOString();
    const created = await serviceFetch('daily_email_subscriptions?on_conflict=email_normalised', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userId,
        email,
        email_normalised: normalised,
        is_subscribed: true,
        confirmed_at: now,
        subscribed_at: now,
        unsubscribed_at: null,
        confirmation_token_hash: null,
        unsubscribe_token_hash: 'pending',
      }),
    });
    if (!created?.ok) return failure(req, 'That could not be saved. Please try again.', 502);

    const rows = (await created.json()) as Subscription[];
    const row = rows[0];
    if (row) {
      await patch(row.id, {
        unsubscribe_token_hash: await tokenDigest(await derivedToken(row.id, row.email_normalised)),
      });
    }
    return json(req, { subscribed: true, email, pending: false });
  }

  /* ---- A guest asking for it ------------------------------------------ */
  if (body.action === 'subscribe') {
    const email = String(body.email ?? '').trim();
    if (!email || !EMAIL.test(email) || email.length > MAX_EMAIL_CHARS) {
      return failure(req, 'That does not look like an email address.');
    }
    if (!hasResendKey()) {
      return failure(req, 'The daily email is not switched on for this deployment yet.', 503, {
        code: 'email_not_configured',
      });
    }

    const normalised = normalise(email);
    const existing = (
      await serviceRows<Subscription>(
        `daily_email_subscriptions?email_normalised=eq.${encodeURIComponent(normalised)}&select=*&limit=1`,
      )
    )[0];

    // Already on the list: say the same thing either way, so this endpoint
    // cannot be used to find out whether an address is subscribed.
    if (existing?.is_subscribed) {
      return json(req, { pending: true });
    }

    const token = randomToken();
    const hash = await tokenDigest(token);
    const now = new Date().toISOString();

    let id = existing?.id ?? '';
    if (existing) {
      await patch(existing.id, { confirmation_token_hash: hash, confirmation_sent_at: now, email });
    } else {
      const created = await serviceFetch('daily_email_subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          email,
          email_normalised: normalised,
          is_subscribed: false,
          confirmation_token_hash: hash,
          confirmation_sent_at: now,
          unsubscribe_token_hash: 'pending',
        }),
      });
      if (!created?.ok) return failure(req, 'That could not be saved. Please try again.', 502);
      id = ((await created.json()) as Subscription[])[0]?.id ?? '';
    }
    if (!id) return failure(req, 'That could not be saved. Please try again.', 502);

    await patch(id, {
      unsubscribe_token_hash: await tokenDigest(await derivedToken(id, normalised)),
    });

    const link = confirmUrl(id, token);
    const sent = await sendOne({
      to: email,
      subject: 'Confirm your daily verse email',
      html: confirmationEmailHtml(link),
      text: confirmationEmailText(link),
    });
    if (!sent.ok) {
      // The address is never named in a log line.
      console.error('confirmation email failed:', sent.error?.slice(0, 120));
      return failure(req, 'That email could not be sent. Please check the address and try again.', 502);
    }

    return json(req, { pending: true });
  }

  return failure(req, 'Unknown action.');
});
