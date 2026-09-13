import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The explanation used to wait on things that had nothing to do with it: an
 * auth round trip in front of every call, and a second request whenever the
 * same passage was asked for twice. These hold that shut.
 */

const SRC = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8');

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

const STUDY = {
  reference: 'John 3:16',
  translation: 'KJV',
  mode: 'simple',
  summary: 'God gave his Son.',
  sections: [{ heading: 'Meaning', body: 'The reason and the result.' }],
  relatedScripture: [],
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Loads the client with fetch counted. */
async function loadClient(reply: unknown = STUDY) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify(reply), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  const client = await import('./client');
  return { client, calls };
}

describe('a passage asked for twice', () => {
  it('is fetched once when the two asks overlap', async () => {
    const { client, calls } = await loadClient();
    const [a, b] = await Promise.all([
      client.getStudy('John 3:16', 'KJV', 'For God so loved the world.'),
      client.getStudy('John 3:16', 'KJV', 'For God so loved the world.'),
    ]);

    expect(a).toEqual(b);
    expect(calls.filter((url) => url.includes('/study'))).toHaveLength(1);
  });

  it('is not fetched at all the second time, once it is cached', async () => {
    const { client, calls } = await loadClient();
    await client.getStudy('John 3:16', 'KJV', 'For God so loved the world.');
    await client.getStudy('John 3:16', 'KJV', 'For God so loved the world.');

    expect(calls.filter((url) => url.includes('/study'))).toHaveLength(1);
    expect(client.getCachedStudy('John 3:16', 'KJV')).toMatchObject({ reference: 'John 3:16' });
  });

  it('keeps different passages and translations apart', async () => {
    const { client, calls } = await loadClient();
    await client.getStudy('John 3:16', 'KJV', 'text');
    await client.getStudy('John 3:17', 'KJV', 'text');
    await client.getStudy('John 3:16', 'BSB', 'text');

    expect(calls.filter((url) => url.includes('/study'))).toHaveLength(3);
  });

  it('is retried after a failure rather than being cached as one', async () => {
    const calls: string[] = [];
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(String(url));
        if (first) {
          first = false;
          return Promise.resolve(new Response('{"error":"nope"}', { status: 502 }));
        }
        return Promise.resolve(new Response(JSON.stringify(STUDY), { status: 200 }));
      }),
    );
    const client = await import('./client');

    await expect(client.getStudy('John 3:16', 'KJV', 'text')).rejects.toThrow();
    await expect(client.getStudy('John 3:16', 'KJV', 'text')).resolves.toMatchObject({
      reference: 'John 3:16',
    });
    expect(calls.filter((url) => url.includes('/study'))).toHaveLength(2);
  });
});

describe('nothing waits on the session', () => {
  it('resolves the token once, not before every request', () => {
    const token = read('lib/authToken.ts');
    expect(token).toMatch(/warming \?\?= supabase\.auth/);
    expect(token).toMatch(/onAuthStateChange/);

    // The client asks the shared module rather than calling getSession itself.
    const client = read('lib/ai/client.ts');
    expect(client).toMatch(/import \{ authToken \} from '\.\.\/authToken'/);
    expect(client).not.toMatch(/getSession/);
  });
});

describe('the verse page', () => {
  const page = read('pages/VersePage.tsx');

  it('renders Scripture without waiting for the explanation', () => {
    // The Scripture card is rendered from `passage` alone; the explanation is a
    // sibling that renders whatever state it happens to be in.
    const scriptureAt = page.indexOf('<ScriptureCard');
    const explanationAt = page.indexOf('{studyLoading ?');
    expect(scriptureAt).toBeGreaterThan(-1);
    expect(explanationAt).toBeGreaterThan(scriptureAt);
    expect(page).not.toMatch(/study\s*&&\s*<ScriptureCard/);
    expect(page).toMatch(/studyLoading \? \(/);
    expect(page).toMatch(/LoadingLines/);
  });

  it('starts the request in the effect that notices the Scripture arrived', () => {
    expect(page).toMatch(/if \(!passage \|\| cachedStudy\) return;\s*\n\s*void loadStudy\(\);/);
    expect(page).toMatch(/\}, \[passageKey\]\);/);
  });

  it('reads the local cache during render, so a return visit shows no skeleton', () => {
    expect(page).toMatch(/const cachedStudy = useMemo\(/);
    expect(page).toMatch(/current\?\.study \?\? cachedStudy/);
  });

  it('ignores a result that belongs to the previous passage', () => {
    expect(page).toMatch(/result\?\.key === passageKey/);
  });
});
