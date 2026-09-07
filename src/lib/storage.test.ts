import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHistory,
  loadHistory,
  loadPreferences,
  loadTrail,
  recordHistory,
  savePreferences,
  saveTrail,
  stashReturnPath,
  takeReturnPath,
} from './storage';

/** A local-storage stand-in, so signed-out behaviour can be tested directly. */
function fakeStorage() {
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

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('preferences for signed-out readers', () => {
  it('starts from sensible defaults', () => {
    const preferences = loadPreferences();
    expect(preferences.translation).toBe('KJV');
    expect(preferences.explanationMode).toBe('simple');
    expect(preferences.audioEnabled).toBe(true);
  });

  it('remembers a chosen translation', () => {
    savePreferences({ translation: 'BSB' });
    expect(loadPreferences().translation).toBe('BSB');
    // and leaves everything else alone
    expect(loadPreferences().explanationMode).toBe('simple');
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    } as unknown as Storage);
    expect(() => savePreferences({ translation: 'ASV' })).not.toThrow();
    expect(loadPreferences().translation).toBe('KJV');
  });
});

describe('study history for signed-out readers', () => {
  it('records most recent first', () => {
    recordHistory({ reference: 'John 3:16', translation: 'KJV', explanationMode: 'simple', source: 'search' });
    recordHistory({ reference: 'Romans 8:28', translation: 'KJV', explanationMode: 'deep', source: 'topic' });
    expect(loadHistory().map((entry) => entry.reference)).toEqual(['Romans 8:28', 'John 3:16']);
  });

  it('does not accumulate duplicates of the same passage', () => {
    recordHistory({ reference: 'John 3:16', translation: 'KJV', explanationMode: 'simple', source: 'search' });
    recordHistory({ reference: 'John 3:16', translation: 'KJV', explanationMode: 'deep', source: 'history' });
    expect(loadHistory()).toHaveLength(1);
    expect(loadHistory()[0].explanationMode).toBe('deep');
  });

  it('keeps the same passage in a different translation separately', () => {
    recordHistory({ reference: 'John 3:16', translation: 'KJV', explanationMode: 'simple', source: 'search' });
    recordHistory({ reference: 'John 3:16', translation: 'BSB', explanationMode: 'simple', source: 'search' });
    expect(loadHistory()).toHaveLength(2);
  });

  it('caps the list so storage cannot grow without bound', () => {
    for (let i = 1; i <= 130; i += 1) {
      recordHistory({ reference: `Psalms ${i}:1`, translation: 'KJV', explanationMode: 'simple', source: 'search' });
    }
    expect(loadHistory()).toHaveLength(100);
    expect(loadHistory()[0].reference).toBe('Psalms 130:1');
  });

  it('can be cleared', () => {
    recordHistory({ reference: 'John 3:16', translation: 'KJV', explanationMode: 'simple', source: 'search' });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});

describe('study trail', () => {
  it('round-trips and is capped', () => {
    const trail = Array.from({ length: 40 }, (_, i) => ({
      reference: `Psalms ${i + 1}:1`,
      path: `/verse/psalms/${i + 1}/1`,
      translation: 'KJV',
    }));
    saveTrail(trail);
    const loaded = loadTrail();
    expect(loaded).toHaveLength(25);
    // The most recent steps are the ones kept.
    expect(loaded[loaded.length - 1].reference).toBe('Psalms 40:1');
  });
});

describe('return path after signing in', () => {
  it('is handed back exactly once', () => {
    stashReturnPath('/verse/romans/8/28');
    expect(takeReturnPath()).toBe('/verse/romans/8/28');
    expect(takeReturnPath()).toBeNull();
  });
});
