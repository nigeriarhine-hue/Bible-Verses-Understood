/**
 * POST /functions/v1/followup — retired.
 *
 * Follow-up questions were removed from the product. The endpoint is kept, and
 * kept deployed, so a browser still running the old bundle gets a sentence it
 * can show rather than a network error against a URL that no longer resolves.
 *
 * It imports nothing from the Gemini client and holds no prompt. There is no
 * path through this file that can produce a billable request — that is the
 * point of it, and the reason it was not simply left in place behind a flag.
 */
import { failure, preflight } from '../_shared/cors.ts';

const GONE =
  'Follow-up questions are no longer available. The Simple Explanation on each ' +
  'verse page now covers what this answered.';

Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // 410 rather than 404: the endpoint existed, the answer is that it is over.
  // Every method gets the same reply, so nothing has to guess.
  return failure(req, GONE, 410, { code: 'followup_retired' });
});
