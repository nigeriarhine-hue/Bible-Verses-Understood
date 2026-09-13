import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ABSOLUTE_MAX_OUTPUT_TOKENS,
  clampOutputTokens,
  DEFAULT_MAX_OUTPUT_TOKENS,
  GEMINI_LONG_OUTPUT_TOKENS,
  GEMINI_STANDARD_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  outputCeiling,
  outputTokensFor,
  resetTokenWarnings,
} from './tokens';

/**
 * Output budgets used to be scattered across the four AI functions, and a
 * request that named none of them fell back to 4,096 — which a thinking model
 * could exhaust on reasoning alone before writing a word of the answer. These
 * pin the shared ceiling down, and pin down that no function has drifted back
 * to a number of its own.
 */

const FUNCTIONS = path.resolve(__dirname, '..');

const withEnv = (env: Record<string, string | undefined>) =>
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });

beforeEach(() => {
  resetTokenWarnings();
  withEnv({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the shared ceiling', () => {
  it('defaults to what gemini-3.6-flash accepts', () => {
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(65_536);
    expect(outputCeiling()).toBe(65_536);
  });

  it('is never the old 4096 bottleneck', () => {
    expect(outputCeiling()).toBeGreaterThan(4096);
    expect(outputTokensFor('standard')).toBeGreaterThan(4096);
    expect(outputTokensFor('long')).toBeGreaterThan(4096);
    expect(outputTokensFor('maximum')).toBeGreaterThan(4096);
  });

  it('takes GEMINI_MAX_OUTPUT_TOKENS when it is usable', () => {
    withEnv({ GEMINI_MAX_OUTPUT_TOKENS: '32768' });
    expect(outputCeiling()).toBe(32_768);
  });

  it('brings every named budget down with it', () => {
    withEnv({ GEMINI_MAX_OUTPUT_TOKENS: '8192' });
    expect(outputTokensFor('standard')).toBe(8192);
    expect(outputTokensFor('long')).toBe(8192);
    expect(outputTokensFor('maximum')).toBe(8192);
  });

  it.each([
    ['not a number', 'plenty'],
    ['a fraction', '16384.5'],
    ['negative', '-16384'],
    ['zero', '0'],
    ['below the floor', String(MIN_OUTPUT_TOKENS - 1)],
    ['above anything real', String(ABSOLUTE_MAX_OUTPUT_TOKENS + 1)],
    ['empty after trimming', '   '],
  ])('ignores a value that is %s, rather than breaking every request', (_label, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withEnv({ GEMINI_MAX_OUTPUT_TOKENS: value });
    expect(outputCeiling()).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    // Blank is simply "unset"; the rest are worth saying out loud, but once.
    if (value.trim()) {
      outputCeiling();
      expect(warn).toHaveBeenCalledTimes(1);
    }
  });
});

describe('named budgets', () => {
  it('order from roomy to the full ceiling', () => {
    expect(GEMINI_STANDARD_OUTPUT_TOKENS).toBeLessThan(GEMINI_LONG_OUTPUT_TOKENS);
    expect(GEMINI_LONG_OUTPUT_TOKENS).toBeLessThan(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(outputTokensFor('standard')).toBe(16_384);
    expect(outputTokensFor('long')).toBe(32_768);
    expect(outputTokensFor('maximum')).toBe(65_536);
  });

  it('leave room for reasoning as well as the answer', () => {
    // The failure that started this: 1,884 answer tokens and 2,197 reasoning
    // tokens together overran a 4,096 limit. The smallest budget now covers
    // that four times over.
    expect(outputTokensFor('standard')).toBeGreaterThan((1884 + 2197) * 4);
  });
});

describe('clampOutputTokens', () => {
  it('keeps an explicit request inside the ceiling', () => {
    expect(clampOutputTokens(999_999)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    withEnv({ GEMINI_MAX_OUTPUT_TOKENS: '20000' });
    expect(clampOutputTokens(999_999)).toBe(20_000);
  });

  it('lifts a request that is too small to finish anything', () => {
    expect(clampOutputTokens(1)).toBe(MIN_OUTPUT_TOKENS);
  });

  it('passes a sensible request through untouched', () => {
    expect(clampOutputTokens(12_288)).toBe(12_288);
  });
});

describe('every AI function asks for a named budget', () => {
  const sources = readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => ({
      name: entry.name,
      code: (() => {
        try {
          return readFileSync(path.join(FUNCTIONS, entry.name, 'index.ts'), 'utf8');
        } catch {
          return '';
        }
      })(),
    }))
    .filter((fn) => fn.code);

  it('finds the functions to check', () => {
    expect(sources.map((f) => f.name).sort()).toEqual([
      'daily-email',
      'devotional',
      'email-subscription',
      'followup',
      'prewarm',
      'scripture',
      'situation',
      'study',
    ]);
  });

  it('situation names a budget where it asks for one', () => {
    const code = sources.find((f) => f.name === 'situation')?.code ?? '';
    expect(code).toMatch(/budget: /);
    expect(code).not.toMatch(/maxOutputTokens/);
  });

  it.each(['prewarm', 'daily-email'])(
    '%s generates through the shared generator, so it names no limit of its own',
    (name) => {
      const code = sources.find((f) => f.name === name)?.code ?? '';
      expect(code).toMatch(/_shared\/generate\.ts/);
      expect(code).not.toMatch(/maxOutputTokens/);
      expect(code).not.toMatch(/budget: /);
    },
  );

  it('study and devotional name theirs in the shared generator', () => {
    // Both moved into _shared/generate.ts so the scheduled prewarm produces
    // exactly what a reader would get, byte for byte, and lands in the cache
    // they would have hit.
    const generate = readFileSync(path.join(FUNCTIONS, '_shared/generate.ts'), 'utf8');
    expect(generate.match(/budget: 'standard'/g)).toHaveLength(2);
    expect(generate.match(/thinkingLevel: 'low'/g)).toHaveLength(2);
    expect(generate).not.toMatch(/maxOutputTokens/);

    for (const name of ['study', 'devotional']) {
      const code = sources.find((f) => f.name === name)?.code ?? '';
      expect(code).toMatch(/_shared\/generate\.ts/);
      expect(code).not.toMatch(/maxOutputTokens/);
    }
  });

  it.each(['scripture', 'followup', 'email-subscription'])(
    '%s imports no Gemini client at all',
    (name) => {
      const code = sources.find((f) => f.name === name)?.code ?? '';
      expect(code).not.toMatch(/from '\.\.\/_shared\/gemini/);
      expect(code).not.toMatch(/maxOutputTokens/);
    },
  );

  it('leaves no hard-coded token number anywhere in the functions', () => {
    for (const { name, code } of sources) {
      expect(code, `${name} still sets a token limit of its own`).not.toMatch(
        /maxOutputTokens\s*[:=]\s*\d/,
      );
    }
  });
});
