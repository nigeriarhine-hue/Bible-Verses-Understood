/**
 * A stable identifier for a signed-out reader's study session, used to keep a
 * navigation trail together. It is random, stored only in this browser, and
 * never linked to a person.
 */
const KEY = 'bvu:session-id';

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'anonymous';
  }
}
