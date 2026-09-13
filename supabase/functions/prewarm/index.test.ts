import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, type Harness } from '../_shared/handler-harness';

/**
 * Warming the day's explanation before anybody asks is only worth doing if it
 * cannot run away with the bill. The cap, the secret and the cache check are
 * what keep it honest.
 */

const STUDY = {
  summary: 'God gave his Son out of love for the world.',
  sections: [{ heading: 'Meaning', body: 'The verse states the reason and the result.' }],
  relatedScripture: [],
};

const load = (options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> =>
  loadHandler(() => import('./index.ts'), {
    geminiJson: { ...STUDY, title: 'A devotional', reflectionQuestion: 'q', prayer: 'p' },
    ...options,
    rows: { daily_verses: [{ reference: 'John 3:16' }], ...options.rows },
  });

const run = (body: unknown = {}, secret = 'cron-secret-never-logged') =>
  new Request('https://project.supabase.co/functions/v1/prewarm', {
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

describe('what it warms', () => {
  it('produces the explanation and the devotional for today', async () => {
    const h = await load();
    const payload = await (await h.handler(run())).json();

    expect(payload.verseOfTheDay).toBe('John 3:16');
    expect(payload.generations).toBe(2);
    expect(h.gemini()).toHaveLength(2);
    expect(h.cacheWrites()).toHaveLength(2);
  });

  it('writes into the same cache a reader would have hit', async () => {
    const h = await load();
    await h.handler(run());

    const modes = h.cacheWrites().map((c) => (c.body as { explanation_mode: string }).explanation_mode);
    expect(modes.sort()).toEqual(['devotional', 'simple']);
    for (const write of h.cacheWrites()) {
      expect(write.body).toMatchObject({ reference: 'John 3:16', translation: 'KJV', prompt_version: 'v2' });
    }
  });

  it('does nothing at all when the day is already warm', async () => {
    const h = await load({ cached: STUDY });
    const payload = await (await h.handler(run())).json();

    expect(payload.generations).toBe(0);
    expect(h.gemini()).toHaveLength(0);
    expect(payload.outcomes.every((o: { result: string }) => o.result === 'cached')).toBe(true);
  });

  it('takes a short configured list, and gives those no devotional', async () => {
    const h = await load({ env: { PREWARM_REFERENCES: 'Romans 8:28, Psalms 23:1' } });
    const payload = await (await h.handler(run())).json();

    const kinds = payload.outcomes.map((o: { reference: string; kind: string }) => `${o.reference}:${o.kind}`);
    expect(kinds).toContain('John 3:16:devotional');
    expect(kinds).toContain('Romans 8:28:study');
    expect(kinds).not.toContain('Romans 8:28:devotional');
  });
});

describe('what stops it running away', () => {
  it('never exceeds its own cap, however long the list', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `Psalms ${i + 1}:1`).join(',');
    const h = await load({ env: { PREWARM_REFERENCES: many } });
    const payload = await (await h.handler(run())).json();

    expect(payload.limit).toBe(12);
    expect(payload.generations).toBe(12);
    expect(h.gemini()).toHaveLength(12);
    expect(payload.outcomes.some((o: { result: string }) => o.result === 'skipped')).toBe(true);
  });

  it('refuses anyone without the scheduling secret', async () => {
    const h = await load();
    expect((await h.handler(run({}, ''))).status).toBe(401);
    expect((await h.handler(run({}, 'guessed'))).status).toBe(401);
    expect(h.gemini()).toHaveLength(0);
  });

  it('only warms translations this app may serve', async () => {
    const h = await load({ env: { PREWARM_TRANSLATIONS: 'NIV,ESV' } });
    await h.handler(run());
    // Neither is public domain, so it falls back to the one most readers use.
    expect(h.of('scripture').every((c) => c.url.includes('/scripture/KJV/'))).toBe(true);
  });

  it('ignores a reference that is not a real passage', async () => {
    const h = await load({ env: { PREWARM_REFERENCES: 'Hezekiah 4:2, not a reference' } });
    const payload = await (await h.handler(run())).json();
    const references = payload.outcomes.map((o: { reference: string }) => o.reference);
    expect(new Set(references)).toEqual(new Set(['John 3:16']));
  });

  it('carries on when one passage fails', async () => {
    const h = await load({ env: { PREWARM_REFERENCES: 'Romans 8:28' }, scripture: { chapters: [] } });
    const payload = await (await h.handler(run())).json();
    expect(payload.outcomes.every((o: { result: string }) => o.result === 'failed')).toBe(true);
    expect(payload.generations).toBe(0);
  });
});
