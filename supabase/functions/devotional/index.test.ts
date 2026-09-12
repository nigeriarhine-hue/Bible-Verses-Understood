import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, post, type Harness } from '../_shared/handler-harness';

/**
 * The general devotional is the same reading for everyone, so it is generated
 * once and shared. A personalised one is written around what a reader said
 * matters to them, so it must never reach shared storage — no saving is worth
 * handing one reader another reader's devotional.
 */

const DEVOTIONAL = {
  title: 'Love that moves first',
  sections: [
    { heading: "Today's Scripture", body: 'The verse sits inside a night-time conversation.' },
    { heading: "Today's Thought", body: 'Love is the reason given, not the reward offered.' },
  ],
  reflectionQuestion: 'Where have you been waiting to be worth loving first?',
  prayer: 'Thank you for loving first.',
  relatedScripture: [
    { book: 'Romans', chapter: 5, startVerse: 8, endVerse: null, relevanceExplanation: 'The same point.' },
  ],
};

const ASK = {
  reference: 'John 3:16',
  translation: 'KJV',
  scriptureText: 'For God so loved the world...',
};

const load = (options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> =>
  loadHandler(() => import('./index.ts'), { geminiJson: DEVOTIONAL, ...options });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the general devotional', () => {
  it('is read from the shared cache before Gemini', async () => {
    const h = await load();
    await h.handler(post('devotional', ASK));
    expect(h.calls[0]?.kind).toBe('cache-read');
  });

  it('costs nothing on a cache hit', async () => {
    const h = await load({ cached: { ...DEVOTIONAL, reference: 'John 3:16' } });
    const res = await h.handler(post('devotional', ASK));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.title).toBe(DEVOTIONAL.title);
    expect(h.gemini()).toHaveLength(0);
  });

  it('is written back so the next reader does not pay for it', async () => {
    const h = await load();
    await h.handler(post('devotional', ASK));

    const write = h.cacheWrites()[0]?.body as Record<string, unknown>;
    expect(write?.explanation_mode).toBe('devotional');
    expect(write?.reference).toBe('John 3:16');
    expect((write?.study_data as { isPersonalized: boolean }).isPersonalized).toBe(false);
  });

  it('asks for low thinking, like the explanation does', async () => {
    const h = await load();
    await h.handler(post('devotional', ASK));
    expect(h.generationConfig()?.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('keeps the generous ceiling', async () => {
    const h = await load();
    await h.handler(post('devotional', ASK));
    expect(h.generationConfig()?.maxOutputTokens).toBe(16_384);
  });
});

describe('a personalised devotional for a signed-in reader', () => {
  const ADA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const GRACE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const interests = ['grief', 'a marriage under strain'];
  const signedIn = (extra: Parameters<typeof loadHandler>[1] = {}) =>
    load({ userId: ADA, ...extra });

  it('is never written to the shared cache', async () => {
    const h = await signedIn();
    const res = await h.handler(post('devotional', { ...ASK, interests }, 'ada-jwt'));

    expect(res.status).toBe(200);
    expect((await res.json()).isPersonalized).toBe(true);
    expect(h.cacheWrites()).toHaveLength(0);
    expect(h.of('private-write')).toHaveLength(1);
  });

  it('is never read from the shared cache either', async () => {
    // A general devotional is sitting in the shared cache; the personalised
    // request must not pick it up, and must not look.
    const h = await signedIn({ cached: { ...DEVOTIONAL, title: 'SOMEONE ELSE’S READING' } });
    const res = await h.handler(post('devotional', { ...ASK, interests }, 'ada-jwt'));

    expect(h.of('cache-read')).toHaveLength(0);
    expect((await res.json()).title).toBe(DEVOTIONAL.title);
  });

  it('is served from the reader’s own cache without calling Gemini', async () => {
    const h = await signedIn({ privateCached: { ...DEVOTIONAL, isPersonalized: true } });
    const res = await h.handler(post('devotional', { ...ASK, interests }, 'ada-jwt'));
    const payload = await res.json();

    expect(payload.cached).toBe(true);
    expect(payload.title).toBe(DEVOTIONAL.title);
    expect(h.gemini()).toHaveLength(0);
    // A hit costs nothing, so it does not spend the day's allowance either.
    expect(h.of('quota')).toHaveLength(0);
  });

  it('reads and writes with the reader’s own credentials, not the service role', async () => {
    const h = await signedIn();
    await h.handler(post('devotional', { ...ASK, interests }, 'ada-jwt'));

    // This is what makes row-level security the thing enforcing privacy: the
    // database checks the owner, rather than trusting the key we computed.
    for (const call of [...h.of('private-read'), ...h.of('private-write')]) {
      expect(call.authorization).toBe('Bearer ada-jwt');
    }
    expect(h.of('private-write')[0]?.body).toMatchObject({ user_id: ADA, prompt_version: 'v2' });
  });

  it('gives two readers different cache identities for the same request', async () => {
    const keyFor = async (userId: string) => {
      const h = await load({ userId });
      await h.handler(post('devotional', { ...ASK, interests }, 'a-jwt'));
      return (h.of('private-write')[0]?.body as { cache_key: string }).cache_key;
    };
    expect(await keyFor(ADA)).not.toBe(await keyFor(GRACE));
  });

  it('changes identity when the interests change, and not when they are reordered', async () => {
    const keyFor = async (chosen: string[]) => {
      const h = await signedIn();
      await h.handler(post('devotional', { ...ASK, interests: chosen }, 'ada-jwt'));
      return (h.of('private-write')[0]?.body as { cache_key: string }).cache_key;
    };
    const base = await keyFor(interests);
    expect(await keyFor([...interests].reverse())).toBe(base);
    expect(await keyFor(interests.map((i) => i.toUpperCase()))).toBe(base);
    expect(await keyFor([...interests, 'a new job'])).not.toBe(base);
    expect(await keyFor(['grief'])).not.toBe(base);
  });

  it('costs a generation, which is the price of not sharing it', async () => {
    const h = await signedIn();
    await h.handler(post('devotional', { ...ASK, interests }, 'ada-jwt'));
    expect(h.gemini()).toHaveLength(1);
    expect(h.of('quota')).toHaveLength(1);
  });
});

describe('a guest who asks for a personalised devotional', () => {
  const interests = ['grief', 'a marriage under strain'];

  it('gets the general one, because there is nowhere private to keep theirs', async () => {
    const h = await load({ userId: null });
    const res = await h.handler(post('devotional', { ...ASK, interests }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.isPersonalized).toBe(false);
    expect(h.of('private-read')).toHaveLength(0);
    expect(h.of('private-write')).toHaveLength(0);
    expect(h.cacheWrites()).toHaveLength(1);
  });

  it('has nothing they chose written into shared storage', async () => {
    const h = await load({ userId: null });
    await h.handler(post('devotional', { ...ASK, interests }));

    const shared = JSON.stringify(h.calls.filter((c) => c.kind !== 'gemini'));
    for (const interest of interests) expect(shared).not.toContain(interest);
    // Nor is it in the prompt: a guest gets the general devotional outright.
    expect(JSON.stringify(h.gemini())).not.toContain('a marriage under strain');
  });

  it('is served the shared cache when it already has one', async () => {
    const h = await load({ userId: null, cached: { ...DEVOTIONAL } });
    const res = await h.handler(post('devotional', { ...ASK, interests }));
    expect((await res.json()).cached).toBe(true);
    expect(h.gemini()).toHaveLength(0);
  });
});

describe('the daily allowance', () => {
  it('is not touched by a cache hit', async () => {
    const h = await load({ cached: { ...DEVOTIONAL } });
    await h.handler(post('devotional', ASK));
    expect(h.of('quota')).toHaveLength(0);
  });

  it('is taken before Gemini, on a miss', async () => {
    const h = await load();
    await h.handler(post('devotional', ASK));
    const order = h.calls.map((c) => c.kind);
    expect(order.indexOf('quota')).toBeLessThan(order.indexOf('gemini'));
    expect(h.of('quota')[0]?.body).toMatchObject({ p_endpoint: 'devotional' });
  });

  it('stops the generation once it is spent', async () => {
    const h = await load({ quota: { allowed: false, used: 15, quota: 15 } });
    const res = await h.handler(post('devotional', ASK));
    const payload = await res.json();

    expect(res.status).toBe(429);
    expect(payload.code).toBe('daily_limit_reached');
    expect(payload.error).toContain('Bible reading and previously prepared explanations remain available');
    expect(h.gemini()).toHaveLength(0);
  });

  it('refuses rather than generating when the database cannot answer', async () => {
    const h = await load({ quotaFails: true });
    const res = await h.handler(post('devotional', ASK));
    expect(res.status).toBe(429);
    expect(h.gemini()).toHaveLength(0);
  });
});
