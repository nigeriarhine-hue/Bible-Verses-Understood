import { describe, expect, it } from 'vitest';
import {
  parseAllowList,
  resolveAllowOrigin,
} from '../../supabase/functions/_shared/origins';

/**
 * CORS decides whether the production site can talk to its own backend, and a
 * mistake here is invisible until a browser refuses a request. These pin the
 * behaviour down.
 */

const PRODUCTION = 'https://bible-verses-understood.vercel.app';

describe('parseAllowList', () => {
  it('splits, trims and drops empties', () => {
    expect(parseAllowList(` ${PRODUCTION} , http://localhost:5173 ,, `)).toEqual([
      PRODUCTION,
      'http://localhost:5173',
    ]);
  });

  it('ignores a trailing slash, which is not part of an Origin header', () => {
    expect(parseAllowList(`${PRODUCTION}/`)).toEqual([PRODUCTION]);
  });

  it('treats an unset variable as an empty list', () => {
    expect(parseAllowList(undefined)).toEqual([]);
    expect(parseAllowList('')).toEqual([]);
  });
});

describe('resolveAllowOrigin', () => {
  it('stays open when no allow-list is configured', () => {
    expect(resolveAllowOrigin(PRODUCTION, [])).toBe('*');
    expect(resolveAllowOrigin(null, [])).toBe('*');
  });

  describe('with an allow-list', () => {
    const list = [PRODUCTION];

    it('reflects an allowed origin rather than echoing a wildcard', () => {
      expect(resolveAllowOrigin(PRODUCTION, list)).toBe(PRODUCTION);
    });

    it('refuses an origin that is not on the list', () => {
      expect(resolveAllowOrigin('https://evil.example', list)).toBeNull();
      expect(resolveAllowOrigin('https://bible-verses-understood.vercel.app.evil.example', list)).toBeNull();
    });

    it('refuses a request with no Origin header', () => {
      expect(resolveAllowOrigin(null, list)).toBeNull();
      expect(resolveAllowOrigin('', list)).toBeNull();
    });

    it('never hands back a different allowed origin', () => {
      const many = [PRODUCTION, 'https://example.test'];
      expect(resolveAllowOrigin('https://evil.example', many)).not.toBe(PRODUCTION);
      expect(resolveAllowOrigin('https://evil.example', many)).toBeNull();
    });

    it('still allows local development on any port', () => {
      for (const origin of [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://[::1]:5173',
      ]) {
        expect(resolveAllowOrigin(origin, list), origin).toBe(origin);
      }
    });

    it('does not mistake a lookalike host for localhost', () => {
      for (const origin of [
        'https://localhost.evil.example',
        'https://notlocalhost',
        'http://127.0.0.1.evil.example',
      ]) {
        expect(resolveAllowOrigin(origin, list), origin).toBeNull();
      }
    });

    it('matches an allowed origin that was configured with a trailing slash', () => {
      expect(resolveAllowOrigin(PRODUCTION, parseAllowList(`${PRODUCTION}/`))).toBe(PRODUCTION);
    });
  });
});
