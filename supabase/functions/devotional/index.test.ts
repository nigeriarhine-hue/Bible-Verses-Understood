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

describe('a personalised devotional', () => {
  const interests = ['grief', 'a marriage under strain'];

  it('is never written to the shared cache', async () => {
    const h = await load();
    const res = await h.handler(post('devotional', { ...ASK, interests }));

    expect(res.status).toBe(200);
    expect((await res.json()).isPersonalized).toBe(true);
    expect(h.cacheWrites()).toHaveLength(0);
  });

  it('is never read from the shared cache either', async () => {
    // A cached general devotional is sitting there; the personalised request
    // must not pick it up, and must not look.
    const h = await load({ cached: { ...DEVOTIONAL, title: 'SOMEONE ELSE’S READING' } });
    const res = await h.handler(post('devotional', { ...ASK, interests }));

    expect(h.calls.filter((c) => c.kind === 'cache-read')).toHaveLength(0);
    expect((await res.json()).title).toBe(DEVOTIONAL.title);
  });

  it('keeps what the reader chose out of every shared write', async () => {
    const h = await load();
    await h.handler(post('devotional', { ...ASK, interests }));

    const shared = h.calls.filter((c) => c.kind !== 'gemini');
    const written = JSON.stringify(shared);
    for (const interest of interests) {
      expect(written).not.toContain(interest);
    }
    expect(shared).toHaveLength(0);
  });

  it('does cost a Gemini call, which is the price of not sharing it', async () => {
    const h = await load();
    await h.handler(post('devotional', { ...ASK, interests }));
    expect(h.gemini()).toHaveLength(1);
  });
});
