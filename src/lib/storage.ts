/**
 * Local storage for signed-out readers.
 *
 * Choosing a translation, reading, and building up a study trail all work
 * without an account — that state lives here, in this browser only, and is
 * never sent anywhere. Saving verses and collections needs an account, so
 * nothing of that kind is kept here.
 */

import type { ExplanationMode } from './ai/types';
import type { StudySource } from '../types/database';

const PREFIX = 'bvu:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* private mode or full quota — the app still works, just without memory */
  }
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

export interface LocalPreferences {
  translation: string;
  explanationMode: ExplanationMode;
  audioEnabled: boolean;
  selectedTopics: string[];
  personalizationEnabled: boolean;
}

const DEFAULT_PREFERENCES: LocalPreferences = {
  translation: 'KJV',
  explanationMode: 'simple',
  audioEnabled: true,
  selectedTopics: [],
  personalizationEnabled: true,
};

export function loadPreferences(): LocalPreferences {
  return { ...DEFAULT_PREFERENCES, ...read<Partial<LocalPreferences>>('preferences', {}) };
}

export function savePreferences(preferences: Partial<LocalPreferences>): LocalPreferences {
  const next = { ...loadPreferences(), ...preferences };
  write('preferences', next);
  return next;
}

/* -------------------------------------------------------------------------- */
/* Study history                                                              */
/* -------------------------------------------------------------------------- */

export interface LocalHistoryEntry {
  reference: string;
  translation: string;
  explanationMode: ExplanationMode | null;
  source: StudySource | null;
  viewedAt: string;
}

const HISTORY_LIMIT = 100;

export function loadHistory(): LocalHistoryEntry[] {
  return read<LocalHistoryEntry[]>('history', []);
}

export function recordHistory(entry: Omit<LocalHistoryEntry, 'viewedAt'>): LocalHistoryEntry[] {
  const existing = loadHistory().filter(
    (item) => !(item.reference === entry.reference && item.translation === entry.translation),
  );
  const next = [{ ...entry, viewedAt: new Date().toISOString() }, ...existing].slice(0, HISTORY_LIMIT);
  write('history', next);
  return next;
}

export function clearHistory(): void {
  write('history', []);
}

/* -------------------------------------------------------------------------- */
/* Study trail — where the reader came from, for "Back to ..."                */
/* -------------------------------------------------------------------------- */

export interface TrailStep {
  reference: string;
  path: string;
  translation: string;
}

const TRAIL_LIMIT = 25;

export function loadTrail(): TrailStep[] {
  return read<TrailStep[]>('trail', []);
}

export function saveTrail(trail: TrailStep[]): void {
  write('trail', trail.slice(-TRAIL_LIMIT));
}

export function clearTrail(): void {
  write('trail', []);
}

/* -------------------------------------------------------------------------- */
/* One-off UI state                                                           */
/* -------------------------------------------------------------------------- */

export function getFlag(name: string): boolean {
  return read<boolean>(`flag:${name}`, false);
}

export function setFlag(name: string, value = true): void {
  write(`flag:${name}`, value);
}

/** Where to send the reader back to after they sign in. */
export function stashReturnPath(path: string): void {
  write('return-path', path);
}

export function takeReturnPath(): string | null {
  const path = read<string | null>('return-path', null);
  if (path) write('return-path', null);
  return path;
}
