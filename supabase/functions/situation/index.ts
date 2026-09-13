/**
 * POST /functions/v1/situation — retired.
 *
 * Life-situation guidance was removed from the product. The endpoint is kept,
 * and kept deployed, so a browser still running the old bundle gets a sentence
 * it can show rather than a network error against a URL that no longer
 * resolves.
 *
 * It was the most expensive thing this app did: never cached, because what a
 * reader wrote about their own life cannot go anywhere another reader could
 * read it, so every single request paid. This file imports nothing from the
 * Gemini client and holds no prompt. There is no path through it that can
 * produce a billable request — that is the point of it, and the reason it was
 * not left in place behind a flag.
 */
import { failure, preflight } from '../_shared/cors.ts';

const GONE =
  'Life-situation guidance is no longer available. Browse by topic, or search for a ' +
  'verse or chapter, and the Simple Explanation on each verse page covers the rest.';

Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // 410 rather than 404: the endpoint existed, the answer is that it is over.
  // Every method gets the same reply, so nothing has to guess.
  return failure(req, GONE, 410, { code: 'situation_retired' });
});
