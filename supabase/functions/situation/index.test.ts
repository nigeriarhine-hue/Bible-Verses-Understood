import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadHandler, post } from '../_shared/handler-harness';

/**
 * Life-situation guidance was the most expensive thing this app did: never
 * cached, because what somebody wrote about their own life cannot go where
 * another reader could see it, so every request paid. The endpoint is kept so
 * an old bundle gets a sentence instead of a dead URL, and these pin down that
 * keeping it cannot cost anything.
 */

const load = () => loadHandler(() => import('./index.ts'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the retired life-situation endpoint', () => {
  it('answers 410 with something a reader can understand', async () => {
    const h = await load();
    const res = await h.handler(
      post('situation', { situation: "I'm scared about losing my job.", translation: 'KJV' }),
    );
    const payload = await res.json();

    expect(res.status).toBe(410);
    expect(payload.error).toMatch(/no longer available/i);
    expect(payload.code).toBe('situation_retired');
    // It points somewhere that still exists.
    expect(payload.error).toMatch(/topic/i);
  });

  it('makes no outbound request of any kind', async () => {
    const h = await load();
    await h.handler(post('situation', { situation: 'Anything at all', translation: 'KJV' }));
    expect(h.calls).toHaveLength(0);
    expect(h.gemini()).toHaveLength(0);
  });

  it('spends no daily allowance, because there is nothing to spend it on', async () => {
    const h = await load();
    await h.handler(post('situation', { situation: 'Anything at all' }));
    expect(h.of('quota')).toHaveLength(0);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('answers 410 to %s as well', async (method) => {
    const h = await load();
    const res = await h.handler(
      new Request('https://project.supabase.co/functions/v1/situation', { method }),
    );
    expect(res.status).toBe(410);
    expect(h.gemini()).toHaveLength(0);
  });

  it('still answers a CORS preflight, so the browser sees the 410', async () => {
    const h = await load();
    const res = await h.handler(
      new Request('https://project.supabase.co/functions/v1/situation', {
        method: 'OPTIONS',
        headers: { origin: 'https://bible-verses-understood.vercel.app' },
      }),
    );
    expect(res.status).toBeLessThan(300);
    expect(h.calls).toHaveLength(0);
  });

  it('never echoes back what the caller wrote about themselves', async () => {
    const h = await load();
    const res = await h.handler(
      post('situation', { situation: 'PRIVATE: my marriage is failing.', translation: 'KJV' }),
    );
    expect(await res.text()).not.toContain('my marriage is failing');
  });

  it('imports no Gemini client and carries no prompt', () => {
    const source = readFileSync(path.resolve(__dirname, 'index.ts'), 'utf8');
    // Strip the file comment: it explains the absence, which is not the same
    // as containing the thing.
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/gemini/i);
    expect(code).not.toMatch(/generateJson|generateText/);
    expect(code).not.toMatch(/SITUATION_SCHEMA|GUARDRAILS|VOICE|budget|thinkingLevel/);
  });
});
