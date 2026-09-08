import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, generateJson, generateText, parseJson } from './gemini';

/**
 * The live `study` function reported "malformed JSON" for every request, which
 * told nobody anything: a truncated reply, a reasoning preamble and genuinely
 * broken output all arrived under the same sentence. These pin down which
 * failure produces which message, and pin down that the diagnostics written on
 * the way past carry no secret.
 *
 * `gemini.ts` runs on Deno in production. Vitest transpiles it here and the two
 * globals it touches — `Deno.env` and `fetch` — are stubbed per test.
 */

const KEY = 'test-api-key-must-never-be-logged';
const SYSTEM = 'PRIVATE SYSTEM PROMPT: the reader is asking about Psalm 23.';
const PROMPT = 'PRIVATE USER PROMPT: explain this verse.';

let requests: Array<{ url: string; init: RequestInit }> = [];

/** Answers each call with the next reply in turn; the last one repeats. */
function respondInTurn(replies: Array<{ status?: number; body: unknown }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      requests.push({ url, init });
      const reply = replies[Math.min(requests.length - 1, replies.length - 1)]!;
      return Promise.resolve(
        new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), {
          status: reply.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

/** Answers every call with this payload and a 200. */
function respondWith(payload: unknown): void {
  respondInTurn([{ body: payload }]);
}

/** The error envelope Google returns when a model has no capacity. */
const overloaded = {
  status: 503,
  body: { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } },
};

/** The model each request was addressed to, in order. */
const modelsCalled = () =>
  requests.map((r) => /models\/([^:]+):generateContent/.exec(r.url)?.[1] ?? '');

/** Runs with GEMINI_MODEL and GEMINI_FALLBACK_MODEL set to these values. */
function withModels(primary?: string, fallback?: string): void {
  const values: Record<string, string | undefined> = {
    GOOGLE_GENERATIVE_AI_API_KEY: KEY,
    GEMINI_MODEL: primary,
    GEMINI_FALLBACK_MODEL: fallback,
  };
  vi.stubGlobal('Deno', { env: { get: (name: string) => values[name] } });
}

/** A candidate that stopped for `finishReason` carrying these parts. */
function candidate(parts: Array<{ text?: string; thought?: boolean }>, finishReason = 'STOP') {
  return { candidates: [{ content: { parts }, finishReason }] };
}

const ask = (extra: Record<string, unknown> = {}) => ({
  system: SYSTEM,
  prompt: PROMPT,
  schema: { type: 'object', properties: { meaning: { type: 'string' } } },
  ...extra,
});

beforeEach(() => {
  requests = [];
  vi.stubGlobal('Deno', { env: { get: (name: string) => (name === 'GOOGLE_GENERATIVE_AI_API_KEY' ? KEY : undefined) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a reasoning part alongside the answer', () => {
  it('is not concatenated into the JSON', async () => {
    respondWith(
      candidate([
        { text: 'I should open with the meaning, then move to application.', thought: true },
        { text: '{"meaning":"The Lord provides."}' },
      ]),
    );
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'The Lord provides.' });
  });

  it('is dropped even when the reasoning itself contains braces', async () => {
    // This is the shape that produced "malformed JSON": the salvage window ran
    // from a brace inside the reasoning to the last brace of the real answer,
    // so the slice between them was never valid JSON.
    respondWith(
      candidate([
        { text: 'The schema wants {"meaning": string}, so I will fill that in.', thought: true },
        { text: '{"meaning":"The Lord provides."}' },
      ]),
    );
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'The Lord provides.' });
  });

  it('leaves a response with no answer part reported as empty, not malformed', async () => {
    respondWith(candidate([{ text: 'Thinking about the schema…', thought: true }]));
    await expect(generateJson(ask())).rejects.toThrow(/returned an empty response/i);
    await expect(generateJson(ask())).rejects.not.toThrow(/malformed/i);
  });

  it('does not disturb a plain response that has no reasoning part', async () => {
    respondWith(candidate([{ text: '{"meaning":"The Lord provides."}' }]));
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'The Lord provides.' });
  });
});

describe('why generation stopped is checked before the text is parsed', () => {
  it('reports a truncated response as truncated, naming the limit', async () => {
    respondWith({
      ...candidate([{ text: '{"meaning":"The Lord is my shep' }], 'MAX_TOKENS'),
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 2008 },
    });
    const error = await generateJson(ask({ maxOutputTokens: 2048 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeminiError);
    const message = (error as GeminiError).message;
    expect(message).toMatch(/ran out of output tokens/i);
    expect(message).toContain('2048');
    expect(message).toMatch(/2008 reasoning token\(s\)/);
    expect(message).not.toMatch(/malformed/i);
    expect((error as GeminiError).status).toBe(502);
  });

  it('still names truncation when the model reported no token counts', async () => {
    respondWith(candidate([{ text: '{"meaning":"The Lord' }], 'MAX_TOKENS'));
    await expect(generateJson(ask())).rejects.toThrow(/ran out of output tokens/i);
  });

  it('reports any other early stop as incomplete rather than malformed', async () => {
    respondWith(candidate([{ text: '{"meaning":"partial' }], 'SAFETY'));
    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect((error as GeminiError).message).toMatch(/stopped early \(SAFETY\)/);
    expect((error as GeminiError).message).not.toMatch(/malformed/i);
  });

  it('reports a prompt the safety filters refused', async () => {
    respondWith({ promptFeedback: { blockReason: 'SAFETY' } });
    await expect(generateJson(ask())).rejects.toThrow(/refused by the safety filters \(SAFETY\)/);
  });

  it('reports an empty response that carries no reason at all', async () => {
    respondWith(candidate([{ text: '   ' }], ''));
    await expect(generateJson(ask())).rejects.toThrow(/returned an empty response/i);
  });
});

describe('output that stopped cleanly and still will not parse', () => {
  const unparseable = 'Here is the study: {"meaning": "The Lord provides",,,}';

  it('is reported as malformed and never salvaged into a partial object', async () => {
    respondWith(candidate([{ text: unparseable }]));
    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeminiError);
    expect((error as GeminiError).message).toBe('The commentary service returned malformed JSON.');
  });

  it('logs diagnostics that name the shape of the reply', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith({
      ...candidate([{ text: 'reasoning', thought: true }, { text: unparseable }]),
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 120 },
    });
    await expect(generateJson(ask({ maxOutputTokens: 6144 }))).rejects.toThrow(GeminiError);

    expect(logged).toHaveBeenCalledTimes(1);
    const diagnostics = JSON.parse(String(logged.mock.calls[0]?.[1]));
    expect(diagnostics).toMatchObject({
      finishReason: 'STOP',
      textLength: unparseable.length,
      maxOutputTokens: 6144,
      promptTokenCount: 900,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 120,
      partCount: 2,
      thoughtPartCount: 1,
    });
  });

  it('logs no key, no prompt and no request headers', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith(candidate([{ text: unparseable }]));
    await expect(
      generateJson(ask({ history: [{ role: 'user', text: 'PRIVATE EARLIER TURN' }] })),
    ).rejects.toThrow(GeminiError);

    const written = logged.mock.calls.flat().map(String).join(' ');
    expect(written).not.toContain(KEY);
    expect(written).not.toContain(SYSTEM);
    expect(written).not.toContain(PROMPT);
    expect(written).not.toContain('PRIVATE EARLIER TURN');
    expect(written).not.toMatch(/x-goog-api-key/i);
  });

  it('caps each excerpt at 300 characters of the model’s own output', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith(candidate([{ text: `${'a'.repeat(5000)} not json ${'z'.repeat(5000)}` }]));
    await expect(generateJson(ask())).rejects.toThrow(GeminiError);

    const diagnostics = JSON.parse(String(logged.mock.calls[0]?.[1]));
    expect(diagnostics.head.length).toBeLessThanOrEqual(300);
    expect(diagnostics.tail.length).toBeLessThanOrEqual(300);
    expect(diagnostics.textLength).toBe(10010);
  });

  it('writes nothing at all when the response parses', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith(candidate([{ text: '{"meaning":"The Lord provides."}' }]));
    await generateJson(ask());
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('the request itself is unchanged', () => {
  it('still asks for JSON against the caller’s schema', async () => {
    respondWith(candidate([{ text: '{"meaning":"ok"}' }]));
    const schema = { type: 'object', properties: { meaning: { type: 'string' } } };
    await generateJson(ask({ schema, maxOutputTokens: 6144 }));

    const body = JSON.parse(String(requests[0]?.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(schema);
    expect(body.generationConfig.maxOutputTokens).toBe(6144);
    expect(requests[0]?.url).toContain('gemini-3.6-flash:generateContent');
  });

  it('leaves generateText returning the raw text', async () => {
    respondWith(candidate([{ text: 'Not JSON, and that is fine here.' }]));
    await expect(generateText({ system: SYSTEM, prompt: PROMPT })).resolves.toBe(
      'Not JSON, and that is fine here.',
    );
  });

  it('reports a missing key as unconfigured rather than calling out', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    respondWith(candidate([{ text: '{}' }]));
    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect((error as GeminiError).status).toBe(503);
    expect(requests).toHaveLength(0);
  });
});

describe('parseJson', () => {
  it('accepts a fenced object', () => {
    expect(parseJson('```json\n{"meaning":"ok"}\n```')).toEqual({ meaning: 'ok' });
  });

  it('recovers an object wrapped in prose', () => {
    expect(parseJson('Sure! {"meaning":"ok"} Hope that helps.')).toEqual({ meaning: 'ok' });
  });

  it('calls an object that was cut off incomplete, not malformed', () => {
    const error = (() => {
      try {
        parseJson('{"meaning":"The Lord is my shep');
      } catch (e) {
        return e as GeminiError;
      }
    })();
    expect(error?.message).toMatch(/incomplete JSON object/);
  });

  it('never returns a partial object when the salvage window will not parse', () => {
    expect(() => parseJson('{ "a": {broken} }')).toThrow(GeminiError);
  });
});

describe('an overloaded model falls back once', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } };

  it('retries the same request on GEMINI_FALLBACK_MODEL and succeeds', async () => {
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([overloaded, answer]);

    await expect(generateJson(ask({ maxOutputTokens: 6144 }))).resolves.toEqual({ meaning: 'ok' });
    expect(modelsCalled()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
    // The retry is the same request, not a reduced one.
    expect(requests[1]?.init.body).toBe(requests[0]?.init.body);
    const body = JSON.parse(String(requests[1]?.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(6144);
  });

  it('recognises UNAVAILABLE by name even under a different status', async () => {
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([
      { status: 500, body: { error: { code: 500, message: 'overloaded', status: 'UNAVAILABLE' } } },
      answer,
    ]);
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'ok' });
    expect(requests).toHaveLength(2);
  });

  it('retries only once, then reports both models as busy', async () => {
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([overloaded]);

    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect(requests).toHaveLength(2);
    expect((error as GeminiError).status).toBe(503);
    expect((error as GeminiError).message).toMatch(
      /busy right now — both gemini-3\.6-flash and gemini-3\.5-flash-lite are overloaded/,
    );
    expect((error as GeminiError).message).toMatch(/try again in a moment/i);
  });

  it('names the secret when the fallback model itself is not usable', async () => {
    withModels('gemini-3.6-flash', 'gemini-typo-flash');
    respondInTurn([
      overloaded,
      { status: 404, body: { error: { code: 404, message: 'models/gemini-typo-flash is not found.', status: 'NOT_FOUND' } } },
    ]);

    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect((error as GeminiError).status).toBe(502);
    expect((error as GeminiError).message).toContain('GEMINI_FALLBACK_MODEL (gemini-typo-flash)');
    expect((error as GeminiError).message).toContain('is not found');
  });

  it('logs the switch without the key', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([overloaded, answer]);
    await generateJson(ask());

    const written = warned.mock.calls.flat().map(String).join(' ');
    expect(written).toMatch(/gemini-3\.6-flash is overloaded — retrying once on gemini-3\.5-flash-lite/);
    expect(written).not.toContain(KEY);
    expect(written).not.toContain(SYSTEM);
    expect(written).not.toContain(PROMPT);
  });
});

describe('what is never retried', () => {
  const single = (status: number, body: unknown) => {
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([{ status, body }]);
  };

  it.each([
    [400, 'INVALID_ARGUMENT', 502],
    [401, 'UNAUTHENTICATED', 502],
    [403, 'PERMISSION_DENIED', 502],
    [404, 'NOT_FOUND', 502],
    [429, 'RESOURCE_EXHAUSTED', 429],
    [500, 'INTERNAL', 502],
  ])('leaves HTTP %i (%s) on the primary model', async (status, reported, expected) => {
    single(status, { error: { code: status, message: 'nope', status: reported } });
    const error = await generateJson(ask()).catch((e: unknown) => e);

    expect(requests).toHaveLength(1);
    expect(modelsCalled()).toEqual(['gemini-3.6-flash']);
    expect((error as GeminiError).status).toBe(expected);
    expect((error as GeminiError).overloaded).toBe(false);
    expect((error as GeminiError).message).toContain(`returned ${status}`);
  });

  it('does not retry when no fallback is configured', async () => {
    withModels('gemini-3.6-flash', undefined);
    respondInTurn([overloaded]);

    const error = await generateJson(ask()).catch((e: unknown) => e);
    expect(requests).toHaveLength(1);
    expect((error as GeminiError).status).toBe(503);
    expect((error as GeminiError).message).toMatch(/busy right now \(gemini-3\.6-flash is overloaded\)/);
    expect((error as GeminiError).message).toMatch(/try again in a moment/i);
  });

  it('does not retry when the fallback secret is blank', async () => {
    withModels('gemini-3.6-flash', '   ');
    respondInTurn([overloaded]);
    await expect(generateJson(ask())).rejects.toThrow(/is overloaded/);
    expect(requests).toHaveLength(1);
  });

  it('does not retry the same model against itself', async () => {
    withModels('gemini-3.6-flash', 'gemini-3.6-flash');
    respondInTurn([overloaded]);
    await expect(generateJson(ask())).rejects.toThrow(/is overloaded/);
    expect(requests).toHaveLength(1);
  });

  it('treats a non-JSON 503 body as an overload all the same', async () => {
    withModels('gemini-3.6-flash', 'gemini-3.5-flash-lite');
    respondInTurn([
      { status: 503, body: '<html>Service Unavailable</html>' },
      { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } },
    ]);
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'ok' });
    expect(requests).toHaveLength(2);
  });

  it('honours GEMINI_MODEL as the primary', async () => {
    withModels('gemini-3.7-flash', 'gemini-3.5-flash-lite');
    respondInTurn([{ body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } }]);
    await generateJson(ask());
    expect(modelsCalled()).toEqual(['gemini-3.7-flash']);
  });
});
