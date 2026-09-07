/** Shared CORS handling for every Edge Function. */
import { parseAllowList, resolveAllowOrigin } from './origins.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowList = parseAllowList(Deno.env.get('ALLOWED_ORIGINS'));
  const allowOrigin = resolveAllowOrigin(origin, allowList);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    // The answer depends on the request's Origin, so caches must not share it.
    Vary: 'Origin',
  };

  // Omitting the header entirely is how a disallowed origin is refused; sending
  // some other allowed origin back would be a confusing way to say the same
  // thing.
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  // 204 with no body is the correct answer to a preflight.
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

export function failure(req: Request, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json(req, { error: message, ...extra }, status);
}
