import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHandler, post, type Harness } from '../_shared/handler-harness';

/**
 * Life-situation guidance is the one endpoint that pays for every request:
 * what a reader wrote about their life cannot go in a cache anyone else reads,
 * and there is nowhere sensible to keep it. So the controls here are the
 * allowance, the reasoning level and the length of the answer — not caching.
 */

const GUIDANCE = {
  situationSummary: 'You are afraid of losing work you depend on.',
  primaryReference: {
    book: 'Matthew', chapter: 6, startVerse: 25, endVerse: 34,
    relevanceExplanation: 'Jesus speaks directly to anxiety about provision.',
  },
  sections: [
    { heading: "What You're Facing", body: 'Fear about money is fear about safety.' },
    { heading: 'What the Passage Means', body: 'The passage does not promise an outcome.' },
    { heading: 'How It May Apply', body: 'It may change what you do with the worry.' },
    { heading: 'Something to Consider', body: 'What would today look like if it were enough?' },
    { heading: 'A Practical Next Step', body: 'Name one thing you can decide this week.' },
  ],
  prayer: 'Be near in what I cannot control.',
  relatedScripture: [
    { book: 'Philippians', chapter: 4, startVerse: 6, endVerse: 7, relevanceExplanation: 'The same worry, answered with prayer.' },
  ],
};

const ASK = { situation: "I'm scared about losing my job.", translation: 'KJV' };

const load = (options: Parameters<typeof loadHandler>[1] = {}): Promise<Harness> =>
  loadHandler(() => import('./index.ts'), { geminiJson: GUIDANCE, ...options });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('what the request asks Gemini for', () => {
  it('uses low thinking', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    expect(h.generationConfig()?.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('uses the standard token tier, not the long one', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    const max = h.generationConfig()?.maxOutputTokens as number;
    expect(max).toBe(16_384);
    expect(max).not.toBe(32_768);
    // Still a generous ceiling: the prompt controls length, not this.
    expect(max).toBeGreaterThan(4096);
  });

  it('caps the answer at 500 words and asks for 300-450', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    const system = String(
      (h.gemini()[0]?.body as { systemInstruction: { parts: Array<{ text: string }> } })
        .systemInstruction.parts[0]?.text,
    ).replace(/\s+/g, ' ');

    expect(system).toMatch(/hard limit/i);
    expect(system).toMatch(/must come to 500 words or fewer/i);
    expect(system).toMatch(/Aim for 300-450/);
    expect(system).toMatch(/Related Scripture explanations are not counted/i);
    expect(system).toMatch(/Do not pad/i);
  });

  it('keeps the safety handling and the theological care', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    const system = String(
      (h.gemini()[0]?.body as { systemInstruction: { parts: Array<{ text: string }> } })
        .systemInstruction.parts[0]?.text,
    ).replace(/\s+/g, ' ');

    expect(system).toMatch(/local crisis line/);
    expect(system).toMatch(/qualified professional/);
    expect(system).toMatch(/never less about their safety/i);
    expect(system).toMatch(/Do not tell them what God is doing/);
    expect(system).toMatch(/never predict any individual's future/i);
    expect(system).toMatch(/traditions read a passage differently/);
  });

  it('still returns Scripture-grounded guidance with related passages', async () => {
    const h = await load();
    const payload = await (await h.handler(post('situation', ASK))).json();
    expect(payload.primaryReference.reference).toBe('Matthew 6:25-34');
    expect(payload.relatedScripture[0].reference).toBe('Philippians 4:6-7');
    expect(payload.sections).toHaveLength(5);
  });
});

describe('nothing a reader wrote is cached', () => {
  it('reads no cache and writes none, shared or private', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    for (const kind of ['cache-read', 'cache-write', 'private-read', 'private-write'] as const) {
      expect(h.of(kind)).toHaveLength(0);
    }
  });

  it('sends what they wrote to Gemini and to nowhere else', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    const elsewhere = JSON.stringify(h.calls.filter((c) => c.kind !== 'gemini'));
    expect(elsewhere).not.toContain('losing my job');
  });
});

describe('the daily allowance', () => {
  it('offers a guest 2 and a signed-in reader 5', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    expect(h.of('quota')[0]?.body).toMatchObject({
      p_endpoint: 'situation',
      p_guest_limit: 2,
      p_user_limit: 5,
    });
  });

  it('is taken before Gemini is reached', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    const order = h.calls.map((c) => c.kind);
    expect(order.indexOf('quota')).toBeLessThan(order.indexOf('gemini'));
  });

  it('sends the address as a digest, never in the clear', async () => {
    const h = await load();
    const req = new Request('https://project.supabase.co/functions/v1/situation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer anon-jwt',
        'x-forwarded-for': '203.0.113.42',
      },
      body: JSON.stringify(ASK),
    });
    await h.handler(req);

    const sent = h.of('quota')[0]?.body as { p_guest_key: string };
    expect(sent.p_guest_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(h.calls)).not.toContain('203.0.113.42');
  });

  it('lets a guest through while they have one left', async () => {
    const h = await load({ quota: { allowed: true, used: 2, quota: 2, signed_in: false } });
    const res = await h.handler(post('situation', ASK));
    expect(res.status).toBe(200);
    expect(h.gemini()).toHaveLength(1);
  });

  it('stops a guest who has used both', async () => {
    const h = await load({ quota: { allowed: false, used: 2, quota: 2, signed_in: false } });
    const res = await h.handler(post('situation', ASK));
    const payload = await res.json();

    expect(res.status).toBe(429);
    expect(payload.code).toBe('daily_limit_reached');
    expect(payload.error).toBe(
      "Today's AI guidance limit has been reached. Bible reading and previously " +
        'prepared explanations remain available.',
    );
    expect(h.gemini()).toHaveLength(0);
  });

  it('stops a signed-in reader who has used all five', async () => {
    const h = await load({
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      quota: { allowed: false, used: 5, quota: 5, signed_in: true },
    });
    const res = await h.handler(post('situation', ASK, 'ada-jwt'));
    expect(res.status).toBe(429);
    expect(h.gemini()).toHaveLength(0);
  });

  it('is counted by the database, not by this process', async () => {
    // The verdict comes back from an RPC carrying the caller's own token, so
    // it is the same count on any instance and survives a cold start. Nothing
    // in the function decides who the caller is or what they have left.
    const h = await load();
    await h.handler(post('situation', ASK));
    const call = h.of('quota')[0];
    expect(call?.url).toContain('/rest/v1/rpc/consume_ai_quota');
    expect(call?.authorization).toBe('Bearer anon-jwt');
    expect(call?.body).not.toHaveProperty('p_user_id');
  });

  it('refuses rather than generating when the database cannot answer', async () => {
    const h = await load({ quotaFails: true });
    const res = await h.handler(post('situation', ASK));
    expect(res.status).toBe(429);
    expect(h.gemini()).toHaveLength(0);
  });
});

describe('a cold start grants nobody a fresh allowance', () => {
  it('asks the database again on a freshly loaded instance', async () => {
    // Each load evaluates the module from scratch, which is what a cold start
    // does to the in-memory map. The allowance is asked for either way, so a
    // caller cannot get more by waiting out a restart or landing on a new
    // instance — the count lives in Postgres, not in this process.
    const first = await load({ quota: { allowed: false, used: 2, quota: 2 } });
    expect((await first.handler(post('situation', ASK))).status).toBe(429);
    expect(first.gemini()).toHaveLength(0);

    const second = await load({ quota: { allowed: false, used: 2, quota: 2 } });
    expect((await second.handler(post('situation', ASK))).status).toBe(429);
    expect(second.of('quota')).toHaveLength(1);
    expect(second.gemini()).toHaveLength(0);
  });

  it('holds nothing about the caller between requests', async () => {
    const h = await load();
    await h.handler(post('situation', ASK));
    await h.handler(post('situation', ASK));
    // Two requests, two consultations — no local tally short-circuits either.
    expect(h.of('quota')).toHaveLength(2);
  });
});
