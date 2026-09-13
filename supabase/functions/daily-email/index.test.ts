import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, type Harness } from '../_shared/handler-harness';

/**
 * The daily send has one cost rule and one safety rule, and both are the kind
 * that only show up under load: one devotional for everybody however many
 * subscribers there are, and no email to anyone who did not ask for it or who
 * already got today's.
 */

const DEVOTIONAL = {
  reference: 'John 3:16',
  translation: 'KJV',
  title: 'Love that moves first',
  sections: [
    { heading: "Today's Scripture", body: 'The verse sits inside a night-time conversation with Nicodemus, and it answers a question he did not quite ask.' },
    { heading: "Today's Thought", body: 'Love is the reason given, not the reward offered.' },
  ],
  reflectionQuestion: 'Where have you been waiting to be worth loving first?',
  prayer: 'Thank you for loving first.',
  isPersonalized: false,
  relatedScripture: [],
};

const subscriber = (n: number) => ({
  id: `0000000${n}-0000-4000-8000-00000000000${n}`,
  email: `reader${n}@example.test`,
  email_normalised: `reader${n}@example.test`,
  failure_count: 0,
});

/** The claim step returns the rows it actually inserted. */
const claims = (people: Array<ReturnType<typeof subscriber>>) =>
  people.map((s, i) => ({ id: `claim-${i}`, subscription_id: s.id }));

function load(options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> {
  const people = (options.rows?.daily_email_subscriptions ?? []) as Array<ReturnType<typeof subscriber>>;
  return loadHandler(() => import('./index.ts'), {
    cached: DEVOTIONAL,
    scripture: {
      chapters: Array.from({ length: 21 }, (_, c) =>
        Array.from({ length: 36 }, (_, v) =>
          c === 2 && v === 15
            ? 'For God so loved the world, that he gave his only begotten Son.'
            : `John ${c + 1}:${v + 1}`,
        ),
      ),
    },
    geminiJson: DEVOTIONAL,
    ...options,
    rows: {
      daily_verses: [{ reference: 'John 3:16' }],
      daily_email_subscriptions: [],
      ...options.rows,
    },
    inserted: { daily_email_sends: claims(people), ...options.inserted },
  });
}

const run = (body: unknown = {}, secret = 'cron-secret-never-logged') =>
  new Request('https://project.supabase.co/functions/v1/daily-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: 'Bearer service-jwt',
      ...(secret ? { 'x-cron-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('who gets it', () => {
  it('asks only for confirmed, subscribed, unsuppressed addresses', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    await h.handler(run());

    const query = h.onTable('daily_email_subscriptions').find((c) => c.method === 'GET')?.url ?? '';
    expect(query).toContain('is_subscribed=eq.true');
    expect(query).toContain('suppressed_at=is.null');
    expect(query).toContain('confirmed_at=not.is.null');
  });

  it('sends nothing at all when nobody has opted in', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [] } });
    const payload = await (await h.handler(run())).json();

    expect(payload.sent).toBe(0);
    expect(h.of('resend')).toHaveLength(0);
  });

  it('gives every recipient their own unsubscribe link', async () => {
    const people = [subscriber(1), subscriber(2), subscriber(3)];
    const h = await load({ rows: { daily_email_subscriptions: people } });
    await h.handler(run());

    const sentBody = h.of('resend')[0]?.body as Array<{ to: string[]; html: string }>;
    expect(sentBody).toHaveLength(3);
    const links = sentBody.map((m) => /id=[0-9a-f-]+&(?:amp;)?token=[0-9a-f]{64}/.exec(m.html)?.[0] ?? '');
    expect(links.every(Boolean)).toBe(true);
    expect(new Set(links).size).toBe(3);
    // Nobody's address appears in anybody else's email.
    expect(sentBody[0].html).not.toContain('reader2@example.test');
  });
});

describe('one devotional, however many subscribers', () => {
  it('calls Gemini not once when the day is already cached', async () => {
    const people = [subscriber(1), subscriber(2), subscriber(3), subscriber(4)];
    const h = await load({ rows: { daily_email_subscriptions: people } });
    const payload = await (await h.handler(run())).json();

    expect(payload.sent).toBe(4);
    expect(payload.devotionalGenerated).toBe(false);
    expect(h.gemini()).toHaveLength(0);
  });

  it('generates exactly once on a cold day, whatever the list size', async () => {
    const people = Array.from({ length: 25 }, (_, i) => subscriber(i));
    const h = await load({ cached: undefined, rows: { daily_email_subscriptions: people } });
    const payload = await (await h.handler(run())).json();

    expect(payload.sent).toBe(25);
    expect(payload.devotionalGenerated).toBe(true);
    expect(h.gemini()).toHaveLength(1);
    // And it is written back, so tomorrow's re-run and the website both hit it.
    expect(h.cacheWrites()).toHaveLength(1);
  });

  it('never asks for a personalised devotional', async () => {
    const h = await load({ cached: undefined, rows: { daily_email_subscriptions: [subscriber(1)] } });
    await h.handler(run());

    const prompt = JSON.stringify(h.gemini()[0]?.body);
    expect(prompt).toContain('for a general reader');
    expect(prompt).not.toMatch(/matter to them right now/);
    // Nor does it touch the private per-reader cache.
    expect(h.of('private-read')).toHaveLength(0);
    expect(h.of('private-write')).toHaveLength(0);
  });

  it('sends the same Scripture and devotional to everyone', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1), subscriber(2)] } });
    await h.handler(run());

    const messages = h.of('resend')[0]?.body as Array<{ html: string }>;
    const strip = (html: string) => html.replace(/id=[0-9a-f-]+&(?:amp;)?token=[0-9a-f]{64}/g, '');
    expect(strip(messages[0].html)).toBe(strip(messages[1].html));
  });
});

describe('the same day is never sent twice', () => {
  it('sends nothing when every recipient was already claimed', async () => {
    // A re-run: the unique key on (send_date, subscription_id) means the
    // insert returns no rows, so there is nobody left to send to.
    const h = await load({
      rows: { daily_email_subscriptions: [subscriber(1), subscriber(2)] },
      inserted: { daily_email_sends: [] },
    });
    const payload = await (await h.handler(run())).json();

    expect(payload.recipients).toBe(0);
    expect(payload.sent).toBe(0);
    expect(h.of('resend')).toHaveLength(0);
  });

  it('claims with ignore-duplicates, so the database decides', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    await h.handler(run());

    const claim = h.onTable('daily_email_sends').find((c) => c.method === 'POST');
    expect(claim?.url).toContain('on_conflict=send_date,subscription_id');
    expect(String((claim?.url ?? '') + JSON.stringify(claim?.body))).toContain('subscription_id');
  });

  it('sends only to the subset that was newly claimed', async () => {
    const people = [subscriber(1), subscriber(2), subscriber(3)];
    const h = await load({
      rows: { daily_email_subscriptions: people },
      // Only the third was not already sent to today.
      inserted: { daily_email_sends: [{ id: 'claim-2', subscription_id: people[2].id }] },
    });
    const payload = await (await h.handler(run())).json();

    expect(payload.recipients).toBe(1);
    const messages = h.of('resend')[0]?.body as Array<{ to: string[] }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toEqual(['reader3@example.test']);
  });
});

describe('delivery safety', () => {
  it('suppresses an address the provider rejects outright', async () => {
    const h = await load({
      rows: { daily_email_subscriptions: [subscriber(1)] },
      resend: { status: 422, body: { message: 'Invalid recipient email' } },
    });
    const payload = await (await h.handler(run())).json();

    expect(payload.failed).toBe(1);
    const patch = h
      .onTable('daily_email_subscriptions')
      .find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(patch.suppressed_at).toEqual(expect.any(String));
    expect(patch.suppression_reason).toContain('rejected');
  });

  it('counts a temporary failure without suppressing on the first one', async () => {
    const h = await load({
      rows: { daily_email_subscriptions: [subscriber(1)] },
      resend: { status: 503, body: { message: 'upstream busy' } },
    });
    await h.handler(run());

    const patch = h
      .onTable('daily_email_subscriptions')
      .find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(patch.failure_count).toBe(1);
    expect(patch.suppressed_at).toBeUndefined();
  });

  it('logs the outcome without the address or the content', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    await h.handler(run());

    const written = JSON.stringify(
      h.onTable('daily_email_sends').concat(h.onTable('daily_email_runs')).map((c) => c.body),
    );
    expect(written).not.toContain('reader1@example.test');
    expect(written).not.toContain('Love that moves first');
    expect(written).not.toContain('For God so loved');
  });

  it('refuses a caller without the scheduling secret', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    expect((await h.handler(run({}, ''))).status).toBe(401);
    expect((await h.handler(run({}, 'guessed'))).status).toBe(401);
    expect(h.of('resend')).toHaveLength(0);
    expect(h.gemini()).toHaveLength(0);
  });

  it('sends nothing on a dry run, and leaves the day sendable', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    const payload = await (await h.handler(run({ dryRun: true }))).json();

    expect(payload.dryRun).toBe(true);
    expect(h.of('resend')).toHaveLength(0);
    // The claims are released, so the real run still goes out.
    expect(h.onTable('daily_email_sends').some((c) => c.method === 'DELETE')).toBe(true);
  });
});

describe('the Scripture in the email', () => {
  it('is a public-domain translation, with its notice attached', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    const payload = await (await h.handler(run())).json();

    expect(payload.translation).toBe('KJV');
    expect(h.of('scripture')[0]?.url).toContain('/scripture/KJV/john.json');
    const messages = h.of('resend')[0]?.body as Array<{ html: string }>;
    expect(messages[0].html).toContain('King James Version (1769). Public domain');
  });

  it('refuses a translation this app may not redistribute', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = await load({
      env: { EMAIL_TRANSLATION: 'NIV' },
      rows: { daily_email_subscriptions: [subscriber(1)] },
    });
    const payload = await (await h.handler(run())).json();

    expect(payload.translation).toBe('KJV');
    expect(warn.mock.calls.flat().join(' ')).toMatch(/not one of the public-domain translations/);
  });

  it('sends nothing rather than a different verse from the site', async () => {
    const h = await load({ rows: { daily_verses: [], daily_email_subscriptions: [subscriber(1)] } });
    const res = await h.handler(run());

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('no_verse');
    expect(h.of('resend')).toHaveLength(0);
    expect(h.gemini()).toHaveLength(0);
  });
});

describe('secrets', () => {
  it('never appear in the response', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    const text = await (await h.handler(run())).text();
    for (const secret of [
      'resend-key-never-logged',
      'cron-secret-never-logged',
      'token-secret-never-logged',
      'test-key-never-logged',
      'service-role-key-never-logged',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('reach Resend in a header and nowhere else', async () => {
    const h = await load({ rows: { daily_email_subscriptions: [subscriber(1)] } });
    await h.handler(run());
    const call = h.of('resend')[0];
    expect(call?.authorization).toBe('Bearer resend-key-never-logged');
    expect(call?.url).not.toContain('resend-key');
    expect(JSON.stringify(call?.body)).not.toContain('resend-key');
  });
});
