import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent, trackPageView } from './analytics';

/**
 * The privacy rule this app makes to its readers: nothing they type about their
 * own life, and nothing from a conversation, reaches analytics. These tests
 * pin that down at the only place events are sent.
 */
describe('analytics', () => {
  let sent: unknown[][];

  beforeEach(() => {
    sent = [];
    vi.stubGlobal('window', {
      gtag: (...args: unknown[]) => sent.push(args),
      location: { href: 'https://example.test/verse/romans/8/28' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends one explicit page_view event per call', () => {
    trackPageView('/verse/romans/8/28', 'Romans 8:28 — Bible Verses Understood');
    expect(sent).toHaveLength(1);
    const [kind, eventName, params] = sent[0] as [string, string, Record<string, unknown>];
    expect(kind).toBe('event');
    expect(eventName).toBe('page_view');
    expect(params.page_path).toBe('/verse/romans/8/28');
    expect(params.page_location).toBe('https://example.test/verse/romans/8/28');
    expect(params.page_title).toBe('Romans 8:28 — Bible Verses Understood');
  });

  it('sends named events with their parameters', () => {
    trackEvent('verse_saved', { reference: 'Romans 8:28', translation: 'KJV' });
    expect(sent[0]).toEqual([
      'event',
      'verse_saved',
      { reference: 'Romans 8:28', translation: 'KJV' },
    ]);
  });

  it('drops empty values rather than sending nulls', () => {
    // @ts-expect-error deliberately passing values the type system forbids
    trackEvent('verse_view', { reference: 'John 3:16', note: undefined, other: null });
    expect(sent[0][2]).toEqual({ reference: 'John 3:16' });
  });

  it('truncates long strings so free text cannot ride along in a parameter', () => {
    const confession = 'I am terrified about my marriage ending. '.repeat(20);
    trackEvent('verse_search', { intent: 'life_situation', reference: confession });
    const params = sent[0][2] as Record<string, string>;
    expect(params.reference.length).toBe(100);
  });

  it('does nothing when analytics is not present', () => {
    vi.stubGlobal('window', {});
    expect(() => trackEvent('verse_view', { reference: 'John 3:16' })).not.toThrow();
    expect(() => trackPageView('/')).not.toThrow();
  });
});
