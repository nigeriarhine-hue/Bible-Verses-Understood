import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadHandler, post } from '../_shared/handler-harness';

/**
 * Follow-up questions were the most expensive feature per answer: never cached,
 * and carrying the whole conversation into every request. The endpoint is kept
 * so an old bundle gets a sentence instead of a dead URL, and these pin down
 * that keeping it cannot cost anything.
 */

const load = () => loadHandler(() => import('./index.ts'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the retired follow-up endpoint', () => {
  it('answers 410 with something a reader can understand', async () => {
    const h = await load();
    const res = await h.handler(
      post('followup', { reference: 'John 3:16', question: 'What does this mean for me?' }),
    );
    const payload = await res.json();

    expect(res.status).toBe(410);
    expect(payload.error).toMatch(/no longer available/i);
    expect(payload.code).toBe('followup_retired');
  });

  it('makes no outbound request of any kind', async () => {
    const h = await load();
    await h.handler(post('followup', { question: 'Anything at all' }));
    expect(h.calls).toHaveLength(0);
    expect(h.gemini()).toHaveLength(0);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('answers 410 to %s as well', async (method) => {
    const h = await load();
    const res = await h.handler(
      new Request('https://project.supabase.co/functions/v1/followup', { method }),
    );
    expect(res.status).toBe(410);
    expect(h.gemini()).toHaveLength(0);
  });

  it('still answers a CORS preflight, so the browser sees the 410', async () => {
    const h = await load();
    const res = await h.handler(
      new Request('https://project.supabase.co/functions/v1/followup', {
        method: 'OPTIONS',
        headers: { origin: 'https://bible-verses-understood.vercel.app' },
      }),
    );
    expect(res.status).toBeLessThan(300);
    expect(h.calls).toHaveLength(0);
  });

  it('imports no Gemini client and carries no prompt', () => {
    const source = readFileSync(path.resolve(__dirname, 'index.ts'), 'utf8');
    // Strip the file comment: it explains the absence, which is not the same
    // as containing the thing.
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/gemini/i);
    expect(code).not.toMatch(/generateJson|generateText/);
    expect(code).not.toMatch(/FOLLOWUP_SCHEMA|GUARDRAILS|VOICE/);
  });
});
