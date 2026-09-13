/**
 * Sending mail, and the two messages this product sends.
 *
 * The Resend key lives only here, as a Supabase secret. It is never returned,
 * never logged, and has no VITE_ counterpart — nothing in the browser bundle
 * can reach it.
 */
import { sha256 } from './store.ts';
import { siteUrl } from './daily.ts';

const RESEND_API = 'https://api.resend.com';

export function hasResendKey(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY'));
}

/** Who the mail comes from. Must be a verified sender on the Resend domain. */
export function fromAddress(): string {
  return Deno.env.get('EMAIL_FROM') ?? 'Bible Verses Understood <verse@bible-verses-understood.com>';
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A link token nobody can forge and the database does not have to remember.
 *
 * Derived with HMAC from the row it belongs to, so the sender can rebuild an
 * unsubscribe link for any subscriber without storing a usable credential
 * anywhere. The digest kept alongside the row is a second check, not the
 * secret: knowing it does not let anybody unsubscribe anyone.
 */
export async function derivedToken(...parts: string[]): Promise<string> {
  const secret = Deno.env.get('EMAIL_TOKEN_SECRET') ?? '';
  if (!secret) throw new Error('EMAIL_TOKEN_SECRET is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts.join(':')));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A one-time token, random rather than derived, for confirming an address. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const tokenDigest = sha256;

/** Compares without leaking where two values first differ. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) same |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return same === 0;
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

export interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** So a mail client can offer one-click unsubscribe. */
  unsubscribeUrl?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  /** True when retrying this address would never work. */
  permanent?: boolean;
  error?: string;
}

function payload(message: Message): Record<string, unknown> {
  return {
    from: fromAddress(),
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.unsubscribeUrl
      ? {
          headers: {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
  };
}

/**
 * Classifies a provider failure.
 *
 * A malformed or rejected address will be malformed tomorrow too, so it is
 * marked permanent and the subscription is suppressed rather than retried
 * every morning for ever. Anything else — rate limits, outages — is worth
 * another day.
 */
function classify(status: number, body: string): SendResult {
  const permanent = status === 422 || status === 400 || /invalid.*(email|recipient)/i.test(body);
  return { ok: false, permanent, error: `${status}: ${body.slice(0, 200)}` };
}

export async function sendOne(message: Message): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(message)),
    });
    const body = await res.text();
    if (!res.ok) return classify(res.status, body);
    const parsed = JSON.parse(body) as { id?: string };
    return { ok: true, id: parsed.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : 'request failed' };
  }
}

/** Resend accepts up to this many messages in one call. */
export const BATCH_SIZE = 100;

/**
 * Sends a batch and reports on each message in order.
 *
 * Every message is distinct — each carries its own unsubscribe link — so this
 * is a batch of separate emails, not one email to many recipients. Nobody sees
 * anybody else's address.
 */
export async function sendBatch(messages: Message[]): Promise<SendResult[]> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return messages.map(() => ({ ok: false, error: 'RESEND_API_KEY is not set' }));
  if (messages.length === 0) return [];

  try {
    const res = await fetch(`${RESEND_API}/emails/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.map(payload)),
    });
    const body = await res.text();
    if (!res.ok) return messages.map(() => classify(res.status, body));

    const parsed = JSON.parse(body) as { data?: Array<{ id?: string }> };
    return messages.map((_, index) => {
      const id = parsed.data?.[index]?.id;
      return id ? { ok: true, id } : { ok: false, error: 'no id returned' };
    });
  } catch (error) {
    return messages.map(() => ({
      ok: false,
      error: error instanceof Error ? error.name : 'request failed',
    }));
  }
}

/* -------------------------------------------------------------------------- */
/* The messages                                                               */
/* -------------------------------------------------------------------------- */

const NAVY = '#0c1b2e';
const CARD = '#132741';
const GOLD = '#e8b64c';
const INK = '#f4f1ea';
const MUTED = '#b9c6d6';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trims prose to a whole sentence near the limit, rather than mid-word. */
export function excerpt(text: string, limit = 420): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return lastStop > limit * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

function shell(title: string, body: string, footer: string): string {
  // Table layout and inline styles, because that is what mail clients render
  // reliably. 600px wide on a desktop, full width and readable on a phone.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${NAVY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="padding:0 0 20px;text-align:center;">
    <span style="font:600 18px/1.3 Georgia,'Times New Roman',serif;color:${GOLD};letter-spacing:.2px;">
      Bible Verses Understood
    </span><br>
    <span style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
      Understand the Word. Apply it to your life.
    </span>
  </td></tr>
  ${body}
  <tr><td style="padding:20px 4px 0;font:400 12px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};text-align:center;">
    ${footer}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function card(inner: string): string {
  return `<tr><td style="background:${CARD};border-radius:14px;padding:22px;margin-bottom:14px;">${inner}</td></tr>
  <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>`;
}

export interface DailyEmailContent {
  date: string;
  reference: string;
  translation: string;
  scriptureText: string;
  copyrightNotice: string;
  devotionalTitle: string;
  devotionalExcerpt: string;
  readUrl: string;
  unsubscribeUrl: string;
}

export function dailyEmailHtml(content: DailyEmailContent): string {
  const body =
    card(`
      <p style="margin:0 0 6px;font:600 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};">
        Verse of the Day
      </p>
      <p style="margin:0 0 12px;font:600 20px/1.3 Georgia,'Times New Roman',serif;color:${INK};">
        ${escapeHtml(content.reference)}
      </p>
      <p style="margin:0;font:400 17px/1.65 Georgia,'Times New Roman',serif;color:${INK};">
        ${escapeHtml(content.scriptureText)}
      </p>
      <p style="margin:14px 0 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
        ${escapeHtml(content.copyrightNotice)}
      </p>`) +
    card(`
      <p style="margin:0 0 10px;font:600 17px/1.35 Georgia,'Times New Roman',serif;color:${INK};">
        ${escapeHtml(content.devotionalTitle)}
      </p>
      <p style="margin:0 0 18px;font:400 15px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
        ${escapeHtml(content.devotionalExcerpt)}
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${GOLD};border-radius:10px;">
          <a href="${escapeHtml(content.readUrl)}"
             style="display:inline-block;padding:13px 22px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#241701;text-decoration:none;">
            Read Today’s Devotional
          </a>
        </td>
      </tr></table>`);

  const footer = `
    <p style="margin:0 0 8px;">You are receiving this once a day because you asked for the Verse of the Day.</p>
    <p style="margin:0 0 8px;">
      <a href="${escapeHtml(content.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(siteUrl())}" style="color:${MUTED};text-decoration:underline;">bible-verses-understood</a>
    </p>
    <p style="margin:0;">Commentary is AI-generated, is not Scripture, and is not a substitute for pastoral or professional guidance.</p>`;

  return shell(`${content.reference} — Verse of the Day`, body, footer);
}

export function dailyEmailText(content: DailyEmailContent): string {
  return [
    'BIBLE VERSES UNDERSTOOD',
    '',
    `Verse of the Day — ${content.reference} (${content.translation})`,
    '',
    content.scriptureText,
    '',
    content.copyrightNotice,
    '',
    '---',
    '',
    content.devotionalTitle,
    '',
    content.devotionalExcerpt,
    '',
    `Read today's devotional: ${content.readUrl}`,
    '',
    '---',
    'You are receiving this once a day because you asked for the Verse of the Day.',
    `Unsubscribe: ${content.unsubscribeUrl}`,
    'Commentary is AI-generated, is not Scripture, and is not a substitute for',
    'pastoral or professional guidance.',
  ].join('\n');
}

export function confirmationEmailHtml(confirmUrl: string): string {
  const body = card(`
    <p style="margin:0 0 10px;font:600 19px/1.35 Georgia,'Times New Roman',serif;color:${INK};">
      Confirm your daily verse email
    </p>
    <p style="margin:0 0 18px;font:400 15px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
      Somebody asked for the Verse of the Day to be sent to this address, once a day.
      If that was you, confirm below. If it was not, ignore this — nothing else will be sent.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${GOLD};border-radius:10px;">
        <a href="${escapeHtml(confirmUrl)}"
           style="display:inline-block;padding:13px 22px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#241701;text-decoration:none;">
          Confirm and start receiving it
        </a>
      </td>
    </tr></table>`);

  return shell(
    'Confirm your daily verse email',
    body,
    '<p style="margin:0;">This link confirms one address and then stops working.</p>',
  );
}

export function confirmationEmailText(confirmUrl: string): string {
  return [
    'BIBLE VERSES UNDERSTOOD',
    '',
    'Somebody asked for the Verse of the Day to be sent to this address, once a day.',
    'If that was you, confirm here:',
    '',
    confirmUrl,
    '',
    'If it was not you, ignore this. Nothing else will be sent.',
  ].join('\n');
}
