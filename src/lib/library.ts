/**
 * The reader's own library: saved verses, saved studies, collections, history
 * and the navigation trail.
 *
 * Everything here requires an account, and every query is scoped by the signed
 * in user. Row Level Security enforces that server-side as well — these
 * functions never assume the client is the only guard.
 */
import { requireSupabase, supabase } from './supabase';
import { getSessionId } from './session';
import type { ExplanationMode, Study } from './ai/types';
import type { Json, StudySource, Tables } from '../types/database';
import type { BibleReference } from './bible/types';

export type SavedVerse = Tables<'saved_verses'>;
export type SavedStudy = Tables<'saved_studies'>;
export type Collection = Tables<'collections'>;
export type HistoryEntry = Tables<'study_history'>;

/** Collection names offered when creating one. Nothing is created for a reader
 *  automatically — these are suggestions, not a required structure. */
export const SUGGESTED_COLLECTIONS = [
  'Favorites',
  'Faith',
  'Prayer',
  'Relationships',
  'Career',
  'Purpose',
  'Anxiety',
  'Encouragement',
  'Personal Growth',
];

/* -------------------------------------------------------------------------- */
/* Saved verses                                                               */
/* -------------------------------------------------------------------------- */

export async function listSavedVerses(userId: string): Promise<SavedVerse[]> {
  const { data, error } = await requireSupabase()
    .from('saved_verses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveVerse(
  userId: string,
  reference: BibleReference,
  translation: string,
  verseText: string,
): Promise<SavedVerse> {
  const { data, error } = await requireSupabase()
    .from('saved_verses')
    .upsert(
      {
        user_id: userId,
        reference: reference.reference,
        book: reference.book,
        chapter: reference.chapter,
        start_verse: reference.startVerse ?? 1,
        end_verse: reference.endVerse,
        translation,
        verse_text: verseText.slice(0, 4000),
      },
      { onConflict: 'user_id,reference,translation' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeSavedVerse(userId: string, id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('saved_verses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------------------- */
/* Saved studies                                                              */
/* -------------------------------------------------------------------------- */

export async function listSavedStudies(userId: string): Promise<SavedStudy[]> {
  const { data, error } = await requireSupabase()
    .from('saved_studies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveStudy(userId: string, study: Study): Promise<SavedStudy> {
  const { data, error } = await requireSupabase()
    .from('saved_studies')
    .upsert(
      {
        user_id: userId,
        reference: study.reference,
        translation: study.translation,
        explanation_mode: study.mode,
        study_data: study as unknown as Json,
      },
      { onConflict: 'user_id,reference,translation,explanation_mode' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeSavedStudy(userId: string, id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('saved_studies')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------------------- */
/* Collections                                                                */
/* -------------------------------------------------------------------------- */

export interface CollectionWithCount extends Collection {
  verse_count: number;
}

export async function listCollections(userId: string): Promise<CollectionWithCount[]> {
  const { data, error } = await requireSupabase()
    .from('collections')
    .select('*, collection_verses(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const { collection_verses: counts, ...collection } = row as Collection & {
      collection_verses: Array<{ count: number }>;
    };
    return { ...collection, verse_count: counts?.[0]?.count ?? 0 };
  });
}

export async function createCollection(
  userId: string,
  name: string,
  description?: string,
): Promise<Collection> {
  const { data, error } = await requireSupabase()
    .from('collections')
    .insert({ user_id: userId, name: name.trim(), description: description?.trim() || null })
    .select()
    .single();
  if (error) {
    throw new Error(
      error.code === '23505' ? `You already have a collection called “${name}”.` : error.message,
    );
  }
  return data;
}

export async function deleteCollection(userId: string, id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('collections')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listCollectionVerses(collectionId: string): Promise<SavedVerse[]> {
  const { data, error } = await requireSupabase()
    .from('collection_verses')
    .select('saved_verses(*)')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => (row as unknown as { saved_verses: SavedVerse | null }).saved_verses)
    .filter((verse): verse is SavedVerse => verse !== null);
}

export async function addVerseToCollection(collectionId: string, savedVerseId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('collection_verses')
    .upsert({ collection_id: collectionId, saved_verse_id: savedVerseId }, { onConflict: 'collection_id,saved_verse_id' });
  if (error) throw new Error(error.message);
}

export async function removeVerseFromCollection(
  collectionId: string,
  savedVerseId: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('collection_verses')
    .delete()
    .eq('collection_id', collectionId)
    .eq('saved_verse_id', savedVerseId);
  if (error) throw new Error(error.message);
}

/** Which collections a saved verse currently belongs to. */
export async function collectionsForVerse(savedVerseId: string): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('collection_verses')
    .select('collection_id')
    .eq('saved_verse_id', savedVerseId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.collection_id);
}

/* -------------------------------------------------------------------------- */
/* History and navigation                                                     */
/* -------------------------------------------------------------------------- */

export async function listHistory(userId: string, limit = 60): Promise<HistoryEntry[]> {
  const { data, error } = await requireSupabase()
    .from('study_history')
    .select('*')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function recordHistory(input: {
  userId: string;
  reference: string;
  translation: string;
  mode: ExplanationMode | null;
  source: StudySource | null;
}): Promise<void> {
  if (!supabase) return;
  // History is a convenience, never a blocker — failures are swallowed.
  await supabase
    .from('study_history')
    .insert({
      user_id: input.userId,
      session_id: getSessionId(),
      reference: input.reference,
      translation: input.translation,
      explanation_mode: input.mode,
      source: input.source,
    })
    .then(undefined, () => undefined);
}

export async function clearHistory(userId: string): Promise<void> {
  const { error } = await requireSupabase().from('study_history').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function recordNavigation(input: {
  userId: string | null;
  fromReference: string | null;
  toReference: string;
  translation: string;
}): Promise<void> {
  if (!supabase || !input.userId) return;
  await supabase
    .from('study_navigation')
    .insert({
      user_id: input.userId,
      session_id: getSessionId(),
      from_reference: input.fromReference,
      to_reference: input.toReference,
      translation: input.translation,
    })
    .then(undefined, () => undefined);
}
