/**
 * Runs a real Edge Function handler under Vitest.
 *
 * Tests only — no deployed function imports this, so it is never bundled.
 *
 * It exists because what matters about these functions now is what they refuse
 * and what they avoid: a retired mode rejected before Gemini, a cache hit that
 * costs nothing, a personalised devotional that never reaches shared storage.
 * None of that is visible in a helper, and asserting on the source text would
 * only prove the code reads a certain way, not that it behaves that way.
 */
import { vi } from 'vitest';

export type Handler = (req: Request) => Response | Promise<Response>;

/** One outbound call the handler made, sorted into what it was for. */
export interface Call {
  kind:
    | 'gemini'
    | 'cache-read'
    | 'cache-write'
    | 'private-read'
    | 'private-write'
    | 'identity'
    | 'quota'
    | 'other';
  url: string;
  method: string;
  body: unknown;
  /** The credentials the call carried, so a private read can be checked. */
  authorization?: string;
}

export interface Harness {
  handler: Handler;
  calls: Call[];
  gemini: () => Call[];
  cacheWrites: () => Call[];
  of: (kind: Call['kind']) => Call[];
  /** The generationConfig of the first Gemini request, if one was made. */
  generationConfig: () => Record<string, unknown> | undefined;
}

export interface HarnessOptions {
  /** Secrets the function sees. A Gemini key is present unless overridden. */
  env?: Record<string, string | undefined>;
  /** Returned from the shared cache, or undefined for a miss. */
  cached?: unknown;
  /** Returned from the caller's private cache, or undefined for a miss. */
  privateCached?: unknown;
  /** What the database says auth.uid() is — null for a guest. */
  userId?: string | null;
  /** The verdict consume_ai_quota gives. Allowed by default. */
  quota?: { allowed: boolean; used?: number; quota?: number; signed_in?: boolean };
  /** Make the quota RPC fail, to check what an unanswerable database does. */
  quotaFails?: boolean;
  /** The JSON the model replies with. */
  geminiJson?: unknown;
}

const DEFAULT_ENV: Record<string, string | undefined> = {
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-key-never-logged',
  GEMINI_MODEL: 'gemini-3.6-flash',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-never-logged',
  SUPABASE_ANON_KEY: 'anon-key',
};

/**
 * Loads a function module with Deno stubbed and its outbound calls recorded.
 *
 * Takes the import as a thunk — `() => import('./index.ts')` — so the specifier
 * resolves against the test file, and so the module is evaluated *after* the
 * stub is in place: store.ts reads its Supabase settings at module load, and a
 * module loaded first would hold the wrong ones.
 */
export async function loadHandler(
  importModule: () => Promise<unknown>,
  options: HarnessOptions = {},
): Promise<Harness> {
  const env = { ...DEFAULT_ENV, ...options.env };
  const calls: Call[] = [];
  let handler: Handler | undefined;

  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (fn: Handler) => {
      handler = fn;
    },
  });

  // Synchronous on purpose: `await fetch(...)` unwraps a plain Response just as
  // happily, and nothing here has anything to wait for.
  const respond = (input: string | URL | Request, init?: RequestInit): Response => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    let body: unknown;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      body = init?.body;
    }

    if (url.includes('generativelanguage.googleapis.com')) {
      calls.push({ kind: 'gemini', url, method, body, authorization });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify(options.geminiJson ?? {}) }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { candidatesTokenCount: 400, thoughtsTokenCount: 50 },
        }),
        { status: 200 },
      );
    }

    if (url.includes('/rpc/ai_identity')) {
      calls.push({ kind: 'identity', url, method, body, authorization });
      return new Response(JSON.stringify(options.userId ?? null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/rpc/consume_ai_quota')) {
      calls.push({ kind: 'quota', url, method, body, authorization });
      if (options.quotaFails) return new Response('boom', { status: 500 });
      const verdict = options.quota ?? { allowed: true };
      return new Response(
        JSON.stringify([
          {
            allowed: verdict.allowed,
            used: verdict.used ?? 1,
            quota: verdict.quota ?? 5,
            signed_in: verdict.signed_in ?? Boolean(options.userId),
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.includes('user_devotional_cache')) {
      if (method === 'POST') {
        calls.push({ kind: 'private-write', url, method, body, authorization });
        return new Response('', { status: 201 });
      }
      calls.push({ kind: 'private-read', url, method, body, authorization });
      return new Response(
        JSON.stringify(
          options.privateCached === undefined ? [] : [{ devotional_data: options.privateCached }],
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.includes('study_cache')) {
      if (method === 'POST') {
        calls.push({ kind: 'cache-write', url, method, body, authorization });
        return new Response('', { status: 201 });
      }
      calls.push({ kind: 'cache-read', url, method, body, authorization });
      return new Response(
        JSON.stringify(options.cached === undefined ? [] : [{ study_data: options.cached }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    calls.push({ kind: 'other', url, method, body, authorization });
    return new Response('{}', { status: 200 });
  };

  vi.stubGlobal('fetch', respond);

  vi.resetModules();
  await importModule();
  if (!handler) throw new Error('the module never called Deno.serve');

  return {
    handler,
    calls,
    gemini: () => calls.filter((c) => c.kind === 'gemini'),
    cacheWrites: () => calls.filter((c) => c.kind === 'cache-write'),
    of: (kind) => calls.filter((c) => c.kind === kind),
    generationConfig: () => {
      const first = calls.find((c) => c.kind === 'gemini');
      return (first?.body as { generationConfig?: Record<string, unknown> })?.generationConfig;
    },
  };
}

/**
 * A POST the way the browser sends one.
 *
 * The Authorization header is what the functions forward to the database, so a
 * test that omits it is testing a caller with no credentials at all.
 */
export function post(path: string, body: unknown, token = 'anon-jwt'): Request {
  return new Request(`https://project.supabase.co/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://bible-verses-understood.vercel.app',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
