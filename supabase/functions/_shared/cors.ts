/** Shared CORS handling for every Edge Function. */

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  // With no explicit allow-list the functions are open, which is what a public
  // Scripture reader needs. Set ALLOWED_ORIGINS to lock them to your domains.
  const allowOrigin =
    allowList.length === 0 ? '*' : origin && allowList.includes(origin) ? origin : allowList[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });
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
