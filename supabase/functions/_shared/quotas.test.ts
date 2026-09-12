import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DAILY_LIMIT_CODE,
  DAILY_LIMIT_MESSAGE,
  dailyQuota,
  resetQuotaWarnings,
} from './quotas';

/**
 * The limits themselves, and the promise the message makes about what survives
 * them. A limit that took the Bible down with it would be a worse product, not
 * a cheaper one.
 */

const withEnv = (env: Record<string, string | undefined> = {}) =>
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });

beforeEach(() => {
  resetQuotaWarnings();
  withEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('daily generation limits', () => {
  it('gives life-situation guidance 2 for a guest and 5 for a reader', () => {
    expect(dailyQuota('situation')).toEqual({ guest: 2, user: 5 });
  });

  it('is more generous where the result is cached and shared', () => {
    // A study or a devotional is generated once and then served to everyone,
    // so its limit only ever bites on genuinely new passages.
    expect(dailyQuota('study').guest).toBeGreaterThan(dailyQuota('situation').guest);
    expect(dailyQuota('devotional').guest).toBeGreaterThan(dailyQuota('situation').guest);
  });

  it('always allows a signed-in reader more than a guest', () => {
    for (const endpoint of ['study', 'devotional', 'situation'] as const) {
      const { guest, user } = dailyQuota(endpoint);
      expect(user).toBeGreaterThan(guest);
      expect(guest).toBeGreaterThan(0);
    }
  });

  it('can be raised or lowered by a secret, without a code change', () => {
    withEnv({ AI_DAILY_LIMIT_SITUATION_GUEST: '1', AI_DAILY_LIMIT_SITUATION_USER: '25' });
    expect(dailyQuota('situation')).toEqual({ guest: 1, user: 25 });
  });

  it('can switch a feature off entirely with a zero', () => {
    withEnv({ AI_DAILY_LIMIT_SITUATION_GUEST: '0' });
    expect(dailyQuota('situation').guest).toBe(0);
  });

  it('leaves the other endpoints alone when one is overridden', () => {
    withEnv({ AI_DAILY_LIMIT_STUDY_GUEST: '3' });
    expect(dailyQuota('study').guest).toBe(3);
    expect(dailyQuota('situation')).toEqual({ guest: 2, user: 5 });
  });

  it.each([
    ['not a number', 'lots'],
    ['a fraction', '2.5'],
    ['negative', '-1'],
    ['absurd', '999999'],
  ])('ignores a limit that is %s rather than leaving it unlimited', (_label, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withEnv({ AI_DAILY_LIMIT_SITUATION_GUEST: value });
    expect(dailyQuota('situation').guest).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('what a reader is told', () => {
  it('is the message the product promised, word for word', () => {
    expect(DAILY_LIMIT_MESSAGE).toBe(
      "Today's AI guidance limit has been reached. Bible reading and previously " +
        'prepared explanations remain available.',
    );
  });

  it('names what still works, because most of the site does', () => {
    expect(DAILY_LIMIT_MESSAGE).toMatch(/Bible reading/);
    expect(DAILY_LIMIT_MESSAGE).toMatch(/previously prepared explanations/);
  });

  it('is told apart from a burst limit by its code', () => {
    expect(DAILY_LIMIT_CODE).toBe('daily_limit_reached');
  });
});

describe('the limiter does not live in this process', () => {
  const store = readFileSync(path.resolve(__dirname, 'store.ts'), 'utf8');

  it('counts in the database, through a function that decides identity itself', () => {
    expect(store).toMatch(/rpc\/consume_ai_quota/);
    // No user id is sent: a caller cannot name whose allowance to spend.
    expect(store).not.toMatch(/p_user_id/);
    expect(store).toMatch(/p_guest_key: guestKey/);
  });

  it('hashes whatever identified a guest before it leaves', () => {
    expect(store).toMatch(/const guestKey = await sha256\(callerKey\(req\)\)/);
  });

  it('keeps the in-memory map for bursts only, and says so', () => {
    const burstSection = store.slice(store.indexOf('in-memory burst limiter'));
    expect(burstSection).toMatch(/Not the cost control/);
    expect(burstSection).toMatch(/forgets everything on a cold start/);
  });

  it('refuses rather than generating when the count cannot be made', () => {
    // Failing open here would uncap every endpoint at exactly the moment the
    // cache is also unreachable, which is the worst time to be uncapped.
    expect(store).toMatch(/could not be made; refusing/);
    expect(store).toMatch(/returned \$\{res\.status\}; refusing/);
  });
});
