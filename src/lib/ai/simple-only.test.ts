import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPLANATION_MODE, normalizeExplanationMode } from './types';
import { loadPreferences, savePreferences } from '../storage';
import { trackEvent } from '../analytics';

/**
 * Deep, Scholar and follow-up questions were removed to stop them costing
 * money. Hiding a control does not do that, so these check the two ways they
 * could come back: a preference saved before the change quietly asking for one,
 * and a control left behind in the UI.
 */

const SRC = path.resolve(__dirname, '../..');

/** A local-storage stand-in; the test environment is node, not a browser. */
function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

afterEach(() => vi.unstubAllGlobals());

/** Every source file under src/, excluding tests. */
function sourceFiles(dir = SRC, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) found.push(full);
  }
  return found;
}

describe('an explanation mode saved before the change', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));

  it.each(['deep', 'scholar'])('reads back as simple, not %s', (stored) => {
    expect(normalizeExplanationMode(stored)).toBe('simple');
  });

  it.each([undefined, null, '', 'simple', 'something else entirely'])(
    'reads %s back as simple too',
    (stored) => {
      expect(normalizeExplanationMode(stored)).toBe('simple');
    },
  );

  it('is simple by the time it leaves storage', () => {
    for (const stored of ['deep', 'scholar']) {
      localStorage.setItem(
        'bvu:preferences',
        JSON.stringify({ translation: 'BSB', explanationMode: stored, audioEnabled: false }),
      );
      const preferences = loadPreferences();
      expect(preferences.explanationMode).toBe('simple');
      // Nothing else about the account is disturbed on the way past.
      expect(preferences.translation).toBe('BSB');
      expect(preferences.audioEnabled).toBe(false);
    }
  });

  it('survives a round trip without coming back', () => {
    localStorage.setItem(
      'bvu:preferences',
      JSON.stringify({ translation: 'KJV', explanationMode: 'deep' }),
    );
    savePreferences({ audioEnabled: true });
    expect(loadPreferences().explanationMode).toBe('simple');
  });
});

describe('the retired controls are gone from the UI', () => {
  const files = sourceFiles();

  it('finds the source to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each([
    ['Deep Explanation', /Deep Explanation/],
    ['Scholar Explanation', /Scholar Explanation/],
    ['the mode selector', /ExplanationModeTabs|EXPLANATION_MODES/],
    ['the follow-up panel', /FollowUpPanel/],
    ['the follow-up client call', /askFollowUp|FollowUpAnswer/],
    ['an invitation to ask a question', /Ask a question|Ask anything|ask a follow-?up/i],
    ['the mode-change analytics event', /explanation_mode_change/],
  ])('no longer mentions %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('has no component files left for either feature', () => {
    const components = readdirSync(path.join(SRC, 'components/study'));
    expect(components).not.toContain('ExplanationModeTabs.tsx');
    expect(components).not.toContain('FollowUpPanel.tsx');
  });

  it('still offers the one explanation, by name', () => {
    const verse = readFileSync(path.join(SRC, 'pages/VersePage.tsx'), 'utf8');
    expect(verse).toContain('EXPLANATION_MODE_LABEL');
    expect(EXPLANATION_MODE).toBe('simple');
  });
});

describe('analytics still carry nothing private', () => {
  const sent: Array<[string, Record<string, unknown>]> = [];

  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal('window', {
      gtag: (_kind: unknown, name: unknown, params: unknown) =>
        sent.push([String(name), (params ?? {}) as Record<string, unknown>]),
      location: { href: 'https://example.test/verse/john/3/16' },
    });
  });

  it('records a verse view without a mode nobody can change', () => {
    trackEvent('verse_view', { reference: 'John 3:16', translation: 'KJV', source: 'search' });
    expect(sent[0]?.[0]).toBe('verse_view');
    expect(sent[0]?.[1]).toEqual({ reference: 'John 3:16', translation: 'KJV', source: 'search' });
  });

  it('still tracks the events worth keeping', () => {
    trackEvent('devotional_view', { reference: 'Psalms 23' });
    trackEvent('verse_saved', { reference: 'Psalms 23' });
    trackEvent('related_scripture_click', { from: 'John 3:16', to: 'Romans 5:8' });
    expect(sent.map(([name]) => name)).toEqual([
      'devotional_view',
      'verse_saved',
      'related_scripture_click',
    ]);
  });

  it('truncates whatever it is handed, so nothing long can ride along', () => {
    trackEvent('verse_search', { query: 'x'.repeat(500) });
    expect(String(sent[0]?.[1].query)).toHaveLength(100);
  });

  it('is never handed the variables that hold what a reader wrote', () => {
    // Guidance is the page that takes free text. `situation` is the textarea's
    // value and `submitted` is what was sent to the model; neither may appear
    // as a value in an event. A literal like 'life_situation' is a category
    // name, not something anyone typed, so only bare identifiers are checked.
    const source = readFileSync(path.join(SRC, 'pages/GuidancePage.tsx'), 'utf8');
    const calls = source.match(/trackEvent\([\s\S]{0,200}?\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/[:{,]\s*(situation|submitted|query|question)\b/);
      expect(call).not.toMatch(/\$\{/);
    }
  });
});
