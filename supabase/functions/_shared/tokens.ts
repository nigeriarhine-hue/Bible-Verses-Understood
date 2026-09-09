/**
 * The one place that decides how many output tokens a Gemini request may use.
 *
 * Every AI function asks for a named budget rather than a number, so no
 * function can quietly drift back to a small limit of its own. The ceiling is
 * the model's real maximum, and each named budget is clamped to it, so setting
 * GEMINI_MAX_OUTPUT_TOKENS for a smaller model brings every tier down with it.
 *
 * Why this matters more than it looks: on a thinking model, reasoning tokens
 * are spent from the same budget as the answer. A request capped at 4,096 could
 * spend 2,197 of them reasoning and then run out mid-sentence, which is exactly
 * what was happening. The budget has to cover the thinking and the answer.
 */

/**
 * gemini-3.6-flash accepts 65,536 output tokens. Overriding GEMINI_MODEL with a
 * model that accepts less is what GEMINI_MAX_OUTPUT_TOKENS is for — and if that
 * is forgotten, the API's own rejection is read and applied (see gemini.ts).
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;

/** A thinking model can burn a smaller budget before it writes anything. */
export const MIN_OUTPUT_TOKENS = 1_024;

/** Nothing accepts more, so a mistyped secret cannot ask for more. */
export const ABSOLUTE_MAX_OUTPUT_TOKENS = 1_048_576;

/** Room for a full answer plus whatever reasoning it takes to get there. */
export const GEMINI_STANDARD_OUTPUT_TOKENS = 16_384;

/** For answers with several sections, related Scripture and prior turns. */
export const GEMINI_LONG_OUTPUT_TOKENS = 32_768;

/** What each caller asks for. A number is never passed in from a function. */
export type OutputBudget = 'standard' | 'long' | 'maximum';

/** Warned about once per isolate rather than on every request. */
let warnedAboutSecret = false;

/**
 * The hard ceiling for this deployment.
 *
 * An unusable GEMINI_MAX_OUTPUT_TOKENS falls back to the default instead of
 * failing the request: a typo in a secret should not take every explanation on
 * the site down with it.
 */
export function outputCeiling(): number {
  const raw = Deno.env.get('GEMINI_MAX_OUTPUT_TOKENS')?.trim();
  if (!raw) return DEFAULT_MAX_OUTPUT_TOKENS;

  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < MIN_OUTPUT_TOKENS ||
    value > ABSOLUTE_MAX_OUTPUT_TOKENS
  ) {
    if (!warnedAboutSecret) {
      warnedAboutSecret = true;
      console.warn(
        `GEMINI_MAX_OUTPUT_TOKENS is not a whole number between ${MIN_OUTPUT_TOKENS} and ` +
          `${ABSOLUTE_MAX_OUTPUT_TOKENS}; falling back to ${DEFAULT_MAX_OUTPUT_TOKENS}.`,
      );
    }
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return value;
}

/** The token limit for a named budget, never above the ceiling. */
export function outputTokensFor(budget: OutputBudget): number {
  const ceiling = outputCeiling();
  if (budget === 'maximum') return ceiling;
  return Math.min(budget === 'long' ? GEMINI_LONG_OUTPUT_TOKENS : GEMINI_STANDARD_OUTPUT_TOKENS, ceiling);
}

/** Keeps any explicit request inside the ceiling and above the floor. */
export function clampOutputTokens(requested: number): number {
  const ceiling = outputCeiling();
  if (!Number.isFinite(requested)) return ceiling;
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(Math.floor(requested), ceiling));
}

/** Resets the once-per-isolate warning. Tests only. */
export function resetTokenWarnings(): void {
  warnedAboutSecret = false;
}
