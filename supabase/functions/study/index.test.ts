import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, post, type Harness } from '../_shared/handler-harness';

/**
 * Simple is the only explanation that generates, and the shared cache is what
 * keeps it from generating twice. Both are cost controls, so both are asserted
 * against the real handler rather than against the shape of the source.
 */

const STUDY = {
  summary: 'God gave his Son out of love for the world.',
  sections: [
    { heading: 'Meaning', body: 'The verse states the reason and the result.' },
    { heading: 'For Your Life Today', body: 'It invites a response rather than an argument.' },
  ],
  relatedScripture: [
    { book: 'Romans', chapter: 5, startVerse: 8, endVerse: null, relevanceExplanation: 'The same love, stated plainly.' },
  ],
};

const ASK = {
  reference: 'John 3:16',
  translation: 'KJV',
  scriptureText: 'For God so loved the world...',
};

const load = (options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> =>
  loadHandler(() => import('./index.ts'), { geminiJson: STUDY, ...options });

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the simple explanation', () => {
  it('is generated and returned', async () => {
    const h = await load();
    const res = await h.handler(post('study', { ...ASK, mode: 'simple' }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.mode).toBe('simple');
    expect(payload.sections).toHaveLength(2);
    expect(payload.relatedScripture[0].reference).toBe('Romans 5:8');
    expect(h.gemini()).toHaveLength(1);
  });

  it('is what a request that names no mode at all gets', async () => {
    const h = await load();
    const res = await h.handler(post('study', ASK));
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('simple');
  });

  it('asks for low thinking', async () => {
    const h = await load();
    await h.handler(post('study', { ...ASK, mode: 'simple' }));
    expect(h.generationConfig()?.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('keeps a generous output ceiling despite the short answer', async () => {
    const h = await load();
    await h.handler(post('study', { ...ASK, mode: 'simple' }));
    const max = h.generationConfig()?.maxOutputTokens as number;
    expect(max).toBe(16_384);
    expect(max).toBeGreaterThan(4096);
  });

  it('still asks for structured JSON against the schema', async () => {
    const h = await load();
    await h.handler(post('study', { ...ASK, mode: 'simple' }));
    expect(h.generationConfig()?.responseMimeType).toBe('application/json');
    expect(h.generationConfig()?.responseSchema).toBeTruthy();
  });
});

describe('retired modes cost nothing', () => {
  it.each(['deep', 'scholar'])('refuses %s before Gemini is called', async (mode) => {
    const h = await load();
    const res = await h.handler(post('study', { ...ASK, mode }));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toContain('no longer available');
    expect(payload.code).toBe('mode_unavailable');
    expect(h.gemini()).toHaveLength(0);
    // Not even a cache lookup: the request is over before that.
    expect(h.calls).toHaveLength(0);
  });

  it.each(['DEEP', 'Scholar'])('refuses %s whatever the casing', async (mode) => {
    const h = await load();
    const res = await h.handler(post('study', { ...ASK, mode }));
    expect(res.status).toBe(400);
    expect(h.gemini()).toHaveLength(0);
  });

  it('refuses a mode nobody has ever heard of', async () => {
    const h = await load();
    const res = await h.handler(post('study', { ...ASK, mode: 'exhaustive' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only the simple explanation is available/);
    expect(h.gemini()).toHaveLength(0);
  });
});

describe('the shared server-side cache', () => {
  it('is read before Gemini', async () => {
    const h = await load();
    await h.handler(post('study', { ...ASK, mode: 'simple' }));
    expect(h.calls[0]?.kind).toBe('cache-read');
    expect(h.calls[0]?.url).toContain('study_cache');
  });

  it('serves a hit without calling Gemini at all', async () => {
    const h = await load({ cached: { ...STUDY, reference: 'John 3:16', mode: 'simple' } });
    const res = await h.handler(post('study', { ...ASK, mode: 'simple' }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.summary).toBe(STUDY.summary);
    expect(h.gemini()).toHaveLength(0);
    expect(h.cacheWrites()).toHaveLength(0);
  });

  it('writes a new explanation back for the next reader', async () => {
    const h = await load();
    await h.handler(post('study', { ...ASK, mode: 'simple' }));

    const write = h.cacheWrites()[0]?.body as Record<string, unknown>;
    expect(write).toBeTruthy();
    expect(write.reference).toBe('John 3:16');
    expect(write.translation).toBe('KJV');
    expect(write.explanation_mode).toBe('simple');
    expect(write.prompt_version).toBe('v2');
    expect(write.cache_key).toEqual(expect.any(String));
  });

  it('keys on reference, translation and Scripture text together', async () => {
    const keyFor = async (ask: Record<string, unknown>) => {
      const h = await load();
      await h.handler(post('study', { ...ASK, ...ask, mode: 'simple' }));
      return (h.cacheWrites()[0]?.body as { cache_key: string }).cache_key;
    };
    const base = await keyFor({});
    expect(await keyFor({})).toBe(base);
    expect(await keyFor({ reference: 'John 3:17' })).not.toBe(base);
    expect(await keyFor({ translation: 'BSB' })).not.toBe(base);
    expect(await keyFor({ scriptureText: 'Different wording entirely.' })).not.toBe(base);
  });

  it('is versioned, so explanations written before the 300-word rewrite are not reused', async () => {
    // PROMPT_VERSION is inside the key, so bumping it retires every old entry
    // without touching anything a reader saved.
    const { PROMPT_VERSION } = await import('../_shared/prompts.ts');
    expect(PROMPT_VERSION).toBe('v2');
  });
});
