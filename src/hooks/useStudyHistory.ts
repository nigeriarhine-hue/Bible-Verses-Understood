import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ExplanationMode } from '../lib/ai/types';
import { listHistory, recordHistory as recordRemoteHistory } from '../lib/library';
import { loadHistory, recordHistory as recordLocalHistory, clearHistory as clearLocalHistory, type LocalHistoryEntry } from '../lib/storage';
import { clearHistory as clearRemoteHistory } from '../lib/library';
import type { StudySource } from '../types/database';

/**
 * Study history, for readers with and without an account.
 *
 * Signed out, it lives in this browser's local storage — no database writes and
 * nothing leaves the device. Signed in, it is also written to study_history so
 * it follows the reader between devices.
 */
export function useStudyHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LocalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (user) {
      try {
        const rows = await listHistory(user.id);
        setEntries(
          rows.map((row) => ({
            reference: row.reference,
            translation: row.translation ?? 'KJV',
            explanationMode: row.explanation_mode,
            source: row.source,
            viewedAt: row.viewed_at,
          })),
        );
        setLoading(false);
        return;
      } catch {
        // Fall through to the local copy if the request fails.
      }
    }
    setEntries(loadHistory());
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const record = useCallback(
    (entry: { reference: string; translation: string; mode: ExplanationMode | null; source: StudySource | null }) => {
      // Always keep the local copy: it is what makes "recently studied" instant.
      setEntries(
        recordLocalHistory({
          reference: entry.reference,
          translation: entry.translation,
          explanationMode: entry.mode,
          source: entry.source,
        }),
      );
      if (user) {
        void recordRemoteHistory({
          userId: user.id,
          reference: entry.reference,
          translation: entry.translation,
          mode: entry.mode,
          source: entry.source,
        });
      }
    },
    [user],
  );

  const clear = useCallback(async () => {
    clearLocalHistory();
    setEntries([]);
    if (user) await clearRemoteHistory(user.id);
  }, [user]);

  return { entries, loading, record, clear, refresh };
}
