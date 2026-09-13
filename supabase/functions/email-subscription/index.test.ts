import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, type Harness } from '../_shared/handler-harness';

/**
 * Nobody is subscribed by accident and nobody is subscribed by somebody else.
 * A guest's address gets one confirmation email and nothing more until the
 * link in it is clicked; a signed-in reader's address is already verified by
 * Supabase Auth, so theirs takes effect at once.
 */

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: null,
  email: 'reader@example.test',
  email_normalised: 'reader@example.test',
  is_subscribed: false,
  confirmed_at: null,
  confirmation_token_hash: null,
  unsubscribe_token_hash: 'pending',
  suppressed_at: null,
};

const load = (options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> =>
  loadHandler(() => import('./index.ts'), {
    rows: { daily_email_subscriptions: [] },
    inserted: { daily_email_subscriptions: [ROW] },
    ...options,
  });

const post = (body: unknown, token = 'anon-jwt') =>
  new Request('https://project.supabase.co/functions/v1/email-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const get = (query: string) =>
  new Request(`https://project.supabase.co/functions/v1/email-subscription?${query}`, {
    headers: { authorization: 'Bearer anon-jwt' },
  });

/** The digest of the token that was emailed, as the row would hold it. */
async function digestOf(harness: Harness): Promise<string> {
  const link = String((harness.of('resend')[0]?.body as { html: string }).html);
  const token = /token=([0-9a-f]{64})/.exec(link)?.[1] ?? '';
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a guest asking for it', () => {
  it('is not subscribed by asking — only a confirmation is sent', async () => {
    const h = await load();
    const res = await h.handler(post({ action: 'subscribe', email: 'reader@example.test' }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.pending).toBe(true);

    const created = h.onTable('daily_email_subscriptions').find((c) => c.method === 'POST')
      ?.body as Record<string, unknown>;
    expect(created.is_subscribed).toBe(false);
    expect(created.confirmed_at).toBeUndefined();

    expect(h.of('resend')).toHaveLength(1);
    const message = h.of('resend')[0]?.body as { subject: string; to: string[] };
    expect(message.subject).toMatch(/confirm/i);
    expect(message.to).toEqual(['reader@example.test']);
  });

  it('stores only a digest of the confirmation token', async () => {
    const h = await load();
    await h.handler(post({ action: 'subscribe', email: 'reader@example.test' }));

    const created = h.onTable('daily_email_subscriptions').find((c) => c.method === 'POST')
      ?.body as Record<string, string>;
    expect(created.confirmation_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await digestOf(h)).toBe(created.confirmation_token_hash);
  });

  it.each(['not-an-email', 'a@b', '', 'x'.repeat(260)])(
    'refuses %s without writing or sending anything',
    async (email) => {
      const h = await load();
      const res = await h.handler(post({ action: 'subscribe', email }));
      expect(res.status).toBe(400);
      expect(h.of('resend')).toHaveLength(0);
      expect(h.onTable('daily_email_subscriptions').filter((c) => c.method === 'POST')).toHaveLength(0);
    },
  );

  it('says the same thing whether or not the address is already on the list', async () => {
    const already = await load({
      rows: { daily_email_subscriptions: [{ ...ROW, is_subscribed: true, confirmed_at: 'now' }] },
    });
    const res = await already.handler(post({ action: 'subscribe', email: 'reader@example.test' }));

    expect(await res.json()).toEqual({ pending: true });
    // And no second confirmation is sent to somebody already subscribed.
    expect(already.of('resend')).toHaveLength(0);
  });
});

describe('confirming', () => {
  it('turns the subscription on and burns the token', async () => {
    const h = await load({
      rows: {
        daily_email_subscriptions: [{ ...ROW, confirmation_token_hash: 'x'.repeat(64) }],
      },
    });
    // The digest in the row has to match what is presented, so derive one.
    const token = 'a'.repeat(64);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const real = await load({
      rows: { daily_email_subscriptions: [{ ...ROW, confirmation_token_hash: hash }] },
    });
    const res = await real.handler(get(`action=confirm&id=${ROW.id}&token=${token}`));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('You are subscribed');

    const patch = real.onTable('daily_email_subscriptions').find((c) => c.method === 'PATCH')
      ?.body as Record<string, unknown>;
    expect(patch.is_subscribed).toBe(true);
    expect(patch.confirmed_at).toEqual(expect.any(String));
    // Cleared, so the link works exactly once.
    expect(patch.confirmation_token_hash).toBeNull();

    // A wrong token changes nothing.
    const wrong = await h.handler(get(`action=confirm&id=${ROW.id}&token=${'b'.repeat(64)}`));
    expect(wrong.status).toBe(400);
  });

  it('refuses a token for a row that has none outstanding', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [ROW] } });
    const res = await h.handler(get(`action=confirm&id=${ROW.id}&token=${'a'.repeat(64)}`));
    expect(res.status).toBe(400);
    expect(h.onTable('daily_email_subscriptions').filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
});

describe('unsubscribing', () => {
  const subscribed = { ...ROW, is_subscribed: true, confirmed_at: 'now' };

  /** The link the sender would have built for this row. */
  async function unsubscribeToken(): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('token-secret-never-logged'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${ROW.id}:${ROW.email_normalised}`),
    );
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('works from the link in the email', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscribed] } });
    const res = await h.handler(get(`action=unsubscribe&id=${ROW.id}&token=${await unsubscribeToken()}`));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('You are unsubscribed');
    const patch = h.onTable('daily_email_subscriptions').find((c) => c.method === 'PATCH')
      ?.body as Record<string, unknown>;
    expect(patch.is_subscribed).toBe(false);
    expect(patch.unsubscribed_at).toEqual(expect.any(String));
  });

  it('needs no account, and asks for nothing', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscribed] } });
    const res = await h.handler(get(`action=unsubscribe&id=${ROW.id}&token=${await unsubscribeToken()}`));
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(h.of('identity')).toHaveLength(0);
  });

  it('refuses a token somebody made up', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscribed] } });
    const res = await h.handler(get(`action=unsubscribe&id=${ROW.id}&token=${'f'.repeat(64)}`));

    expect(res.status).toBe(400);
    expect(h.onTable('daily_email_subscriptions').filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('is calm about being used twice', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [ROW] } });
    const res = await h.handler(get(`action=unsubscribe&id=${ROW.id}&token=${await unsubscribeToken()}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('already off the list');
  });
});

describe('a signed-in reader', () => {
  const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('turns it on without a second confirmation', async () => {
    const h = await load({ userId: USER });
    const res = await h.handler(
      post({ action: 'set', subscribed: true, email: 'reader@example.test' }, 'reader-jwt'),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).subscribed).toBe(true);
    const created = h.onTable('daily_email_subscriptions').find((c) => c.method === 'POST')
      ?.body as Record<string, unknown>;
    expect(created.user_id).toBe(USER);
    expect(created.is_subscribed).toBe(true);
    // Their address came from the account, so no confirmation email is sent.
    expect(h.of('resend')).toHaveLength(0);
  });

  it('turns it off again', async () => {
    const h = await load({
      userId: USER,
      rows: { daily_email_subscriptions: [{ ...ROW, user_id: USER, is_subscribed: true }] },
    });
    const res = await h.handler(post({ action: 'set', subscribed: false }, 'reader-jwt'));

    expect((await res.json()).subscribed).toBe(false);
    const patch = h.onTable('daily_email_subscriptions').find((c) => c.method === 'PATCH')
      ?.body as Record<string, unknown>;
    expect(patch.is_subscribed).toBe(false);
  });

  it('is asked to sign in when they are not', async () => {
    const h = await load({ userId: null });
    for (const action of ['status', 'set']) {
      const res = await h.handler(post({ action, subscribed: true }));
      expect(res.status).toBe(401);
    }
    expect(h.onTable('daily_email_subscriptions').filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('is identified by the database, not by what the request claims', async () => {
    const h = await load({ userId: USER });
    await h.handler(post({ action: 'status', user_id: 'somebody-else' }, 'reader-jwt'));
    expect(h.of('identity')[0]?.authorization).toBe('Bearer reader-jwt');
    const read = h.onTable('daily_email_subscriptions')[0]?.url ?? '';
    expect(read).toContain(`user_id=eq.${USER}`);
    expect(read).not.toContain('somebody-else');
  });
});

describe('secrets', () => {
  it('never reach the response or the database', async () => {
    const h = await load();
    const res = await h.handler(post({ action: 'subscribe', email: 'reader@example.test' }));
    const text = await res.text();
    const written = JSON.stringify(h.calls.filter((c) => c.kind !== 'resend'));

    for (const secret of ['resend-key-never-logged', 'token-secret-never-logged', 'cron-secret-never-logged']) {
      expect(text).not.toContain(secret);
      expect(written).not.toContain(secret);
    }
  });
});
