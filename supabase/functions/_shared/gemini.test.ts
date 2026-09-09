import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, generateJson, generateText, parseJson, resetLearnedLimits } from './gemini';
import { DEFAULT_MAX_OUTPUT_TOKENS, outputTokensFor, resetTokenWarnings } from './tokens';

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
  withEnv({ GEMINI_MODEL: primary, GEMINI_FALLBACK_MODEL: fallback });
}

/** The maxOutputTokens each request asked for, in order. */
const budgetsAsked = () =>
  requests.map((r) => JSON.parse(String(r.init.body)).generationConfig.maxOutputTokens as number);

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

/** Runs with these secrets set; the key is always present unless overridden. */
function withEnv(env: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = { GOOGLE_GENERATIVE_AI_API_KEY: KEY, ...env };
  vi.stubGlobal('Deno', { env: { get: (name: string) => values[name] } });
}

beforeEach(() => {
  requests = [];
  resetLearnedLimits();
  resetTokenWarnings();
  withEnv();
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
  it('reports a truncation that even the ceiling could not finish', async () => {
    respondWith({
      ...candidate([{ text: '{"meaning":"The Lord is my shep' }], 'MAX_TOKENS'),
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 2008 },
    });
    const error = await generateJson(ask({ maxOutputTokens: 2048 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeminiError);
    const message = (error as GeminiError).message;
    expect(message).toMatch(/ran out of output tokens/i);
    // The limit it names is the one the last attempt actually used.
    expect(message).toContain(String(DEFAULT_MAX_OUTPUT_TOKENS));
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
    expect((error as GeminiError).retry).toBe('none');
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

describe('output token budgets', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } };

  it('no longer falls back to 4096 when a caller names nothing', async () => {
    respondInTurn([answer]);
    await generateJson(ask());
    expect(budgetsAsked()).toEqual([outputTokensFor('standard')]);
    expect(budgetsAsked()[0]).toBeGreaterThan(4096);
  });

  it.each([
    ['standard', 16_384],
    ['long', 32_768],
    ['maximum', 65_536],
  ] as const)('sends %s as %i tokens', async (budget, expected) => {
    respondInTurn([answer]);
    await generateJson({ ...ask(), budget });
    expect(budgetsAsked()).toEqual([expected]);
  });

  it('keeps an explicit request inside the ceiling', async () => {
    respondInTurn([answer]);
    await generateJson(ask({ maxOutputTokens: 999_999 }));
    expect(budgetsAsked()).toEqual([DEFAULT_MAX_OUTPUT_TOKENS]);
  });

  it('follows GEMINI_MAX_OUTPUT_TOKENS down for a smaller model', async () => {
    withEnv({ GEMINI_MAX_OUTPUT_TOKENS: '8192' });
    respondInTurn([answer]);
    await generateJson({ ...ask(), budget: 'maximum' });
    expect(budgetsAsked()).toEqual([8192]);
  });

  it('sends no thinking configuration unless one is asked for', async () => {
    respondInTurn([answer]);
    await generateJson(ask());
    expect(JSON.parse(String(requests[0]?.init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });

  it.each(['low', 'high', 'HIGH'])('passes GEMINI_THINKING_LEVEL=%s through', async (level) => {
    withEnv({ GEMINI_THINKING_LEVEL: level });
    respondInTurn([answer]);
    await generateJson(ask());
    expect(JSON.parse(String(requests[0]?.init.body)).generationConfig.thinkingConfig).toEqual({
      thinkingLevel: level.toLowerCase(),
    });
  });

  it('ignores a GEMINI_THINKING_LEVEL the API does not define', async () => {
    withEnv({ GEMINI_THINKING_LEVEL: 'maximum-effort' });
    respondInTurn([answer]);
    await generateJson(ask());
    expect(JSON.parse(String(requests[0]?.init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });
});

describe('a truncated answer is retried once at the ceiling', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } };
  const truncated = {
    body: {
      candidates: [{ content: { parts: [{ text: '{"meaning":"cut off' }] }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: { candidatesTokenCount: 1884, thoughtsTokenCount: 2197 },
    },
  };

  it('escalates straight to the ceiling and returns the finished answer', async () => {
    respondInTurn([truncated, answer]);
    await expect(generateJson(ask({ maxOutputTokens: 4096 }))).resolves.toEqual({ meaning: 'ok' });
    expect(budgetsAsked()).toEqual([4096, DEFAULT_MAX_OUTPUT_TOKENS]);
  });

  it('escalates from a named budget too', async () => {
    respondInTurn([truncated, answer]);
    await expect(generateJson({ ...ask(), budget: 'standard' })).resolves.toEqual({ meaning: 'ok' });
    expect(budgetsAsked()).toEqual([outputTokensFor('standard'), DEFAULT_MAX_OUTPUT_TOKENS]);
  });

  it('retries once and only once, however long the truncation persists', async () => {
    respondInTurn([truncated]);
    await expect(generateJson(ask({ maxOutputTokens: 4096 }))).rejects.toThrow(/ran out of output tokens/i);
    expect(requests).toHaveLength(2);
  });

  it('does not retry a request that already used the ceiling', async () => {
    respondInTurn([truncated]);
    const error = await generateJson({ ...ask(), budget: 'maximum' }).catch((e: unknown) => e);
    expect(requests).toHaveLength(1);
    expect((error as GeminiError).retry).toBe('more-tokens');
    expect((error as GeminiError).message).toContain(String(DEFAULT_MAX_OUTPUT_TOKENS));
  });

  it('never hands back the partial JSON it did receive', async () => {
    respondInTurn([truncated]);
    const error = await generateJson({ ...ask(), budget: 'maximum' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeminiError);
    expect((error as GeminiError).message).not.toMatch(/malformed/i);
    expect((error as GeminiError).message).toMatch(/1884 output token\(s\)/);
    expect((error as GeminiError).message).toMatch(/2197 reasoning token\(s\)/);
  });

  it('does not stack with the model fallback beyond one of each', async () => {
    withEnv({ GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' });
    // Overloaded on the primary, truncated on the fallback, for ever.
    respondInTurn([overloaded, truncated]);
    await expect(generateJson({ ...ask(), budget: 'standard' })).rejects.toThrow(/ran out of output tokens/i);
    // Three calls, not four: the escalation starts again on the primary, and a
    // truncation is not an overload, so the model fallback is not taken again.
    // Each retry is a one-shot on its own axis and they do not multiply.
    expect(modelsCalled()).toEqual([
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
    ]);
    expect(budgetsAsked()).toEqual([
      outputTokensFor('standard'),
      outputTokensFor('standard'),
      DEFAULT_MAX_OUTPUT_TOKENS,
    ]);
  });
});

describe('a limit the API itself rejects', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } };
  const tooHigh = (max: number) => ({
    status: 400,
    body: {
      error: {
        code: 400,
        message: `Invalid value at 'generation_config.max_output_tokens' (must be <= ${max})`,
        status: 'INVALID_ARGUMENT',
      },
    },
  });

  it('is corrected to the value the API named, not back to 4096', async () => {
    respondInTurn([tooHigh(24_576), answer]);
    await expect(generateJson({ ...ask(), budget: 'maximum' })).resolves.toEqual({ meaning: 'ok' });
    expect(budgetsAsked()).toEqual([DEFAULT_MAX_OUTPUT_TOKENS, 24_576]);
  });

  it('is remembered, so the next request starts inside the limit', async () => {
    respondInTurn([tooHigh(24_576), answer]);
    await generateJson({ ...ask(), budget: 'maximum' });
    requests.length = 0;
    respondInTurn([answer]);
    await generateJson({ ...ask(), budget: 'maximum' });
    expect(budgetsAsked()).toEqual([24_576]);
  });

  it('is corrected at most once, so a stubborn rejection cannot loop', async () => {
    respondInTurn([tooHigh(24_576)]);
    await expect(generateJson({ ...ask(), budget: 'maximum' })).rejects.toThrow(/returned 400/);
    expect(requests).toHaveLength(2);
  });

  it('leaves an unrelated 400 alone', async () => {
    respondInTurn([
      { status: 400, body: { error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } } },
    ]);
    await expect(generateJson(ask())).rejects.toThrow(/returned 400/);
    expect(requests).toHaveLength(1);
  });
});

describe('a thinking level the model will not take', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }] } };
  const refused = {
    status: 400,
    body: {
      error: {
        code: 400,
        message: 'thinking_level is not supported for this model.',
        status: 'INVALID_ARGUMENT',
      },
    },
  };

  it('is dropped and the request resent, rather than failing every explanation', async () => {
    withEnv({ GEMINI_THINKING_LEVEL: 'high' });
    respondInTurn([refused, answer]);
    await expect(generateJson(ask())).resolves.toEqual({ meaning: 'ok' });

    expect(JSON.parse(String(requests[0]?.init.body)).generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'high',
    });
    expect(JSON.parse(String(requests[1]?.init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('is remembered, so later requests never send it again', async () => {
    withEnv({ GEMINI_THINKING_LEVEL: 'high' });
    respondInTurn([refused, answer]);
    await generateJson(ask());
    requests.length = 0;
    respondInTurn([answer]);
    await generateJson(ask());
    expect(JSON.parse(String(requests[0]?.init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('cannot loop when the rejection has nothing to do with thinking', async () => {
    withEnv({ GEMINI_THINKING_LEVEL: 'high' });
    respondInTurn([
      { status: 400, body: { error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } } },
    ]);
    await expect(generateJson(ask())).rejects.toThrow(/returned 400/);
    expect(requests).toHaveLength(1);
  });
});

describe('optional usage logging', () => {
  const answer = { body: { candidates: [{ content: { parts: [{ text: '{"meaning":"ok"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 1884, thoughtsTokenCount: 2197, totalTokenCount: 4981 } } };

  it('says nothing unless GEMINI_LOG_USAGE is set', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    respondInTurn([answer]);
    await generateJson(ask());
    expect(logged).not.toHaveBeenCalled();
  });

  it('reports the model, the limit and the token counts when it is', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_LOG_USAGE: '1' });
    respondInTurn([answer]);
    await generateJson({ ...ask(), budget: 'long' });

    expect(JSON.parse(String(logged.mock.calls[0]?.[1]))).toEqual({
      model: 'gemini-3.6-flash',
      maxOutputTokens: outputTokensFor('long'),
      ceiling: DEFAULT_MAX_OUTPUT_TOKENS,
      finishReason: 'STOP',
      promptTokenCount: 900,
      candidatesTokenCount: 1884,
      thoughtsTokenCount: 2197,
      totalTokenCount: 4981,
    });
  });

  it('logs no key, no prompt and no answer text', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    withEnv({ GEMINI_LOG_USAGE: '1' });
    respondInTurn([answer]);
    await generateJson(ask({ history: [{ role: 'user', text: 'PRIVATE EARLIER TURN' }] }));

    const written = logged.mock.calls.flat().map(String).join(' ');
    expect(written).not.toContain(KEY);
    expect(written).not.toContain(SYSTEM);
    expect(written).not.toContain(PROMPT);
    expect(written).not.toContain('PRIVATE EARLIER TURN');
    expect(written).not.toContain('meaning');
  });
});
