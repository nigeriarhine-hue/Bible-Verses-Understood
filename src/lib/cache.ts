/**
 * Tiny two-tier cache: an in-memory map backed by localStorage so a reload does
 * not re-fetch Scripture or re-generate a study the user already paid for.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

const memory = new Map<string, Entry<unknown>>();

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Touch it — Safari private mode throws on write.
    const probe = '__bvu_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function cacheGet<T>(key: string): T | null {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) {
    if (hit.expires > Date.now()) return hit.value;
    memory.delete(key);
  }
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (parsed.expires <= Date.now()) {
      store.removeItem(key);
      return null;
    }
    memory.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  memory.set(key, entry);
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exceeded — drop the oldest cached entries and move on.
    pruneStorage(store);
    try {
      store.setItem(key, JSON.stringify(entry));
    } catch {
      /* still full: memory cache is enough */
    }
  }
}

function pruneStorage(store: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && key.startsWith('bvu:')) keys.push(key);
  }
  // Remove the oldest half by expiry.
  const scored = keys
    .map((key) => {
      try {
        return { key, expires: (JSON.parse(store.getItem(key) ?? '{}') as Entry<unknown>).expires ?? 0 };
      } catch {
        return { key, expires: 0 };
      }
    })
    .sort((a, b) => a.expires - b.expires);
  for (const { key } of scored.slice(0, Math.ceil(scored.length / 2))) store.removeItem(key);
}

/** De-duplicates concurrent requests for the same key. */
const inflight = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== null) return cached;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
