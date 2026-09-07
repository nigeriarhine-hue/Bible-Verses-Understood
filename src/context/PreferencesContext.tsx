import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { trackEvent } from '../lib/analytics';
import type { ExplanationMode } from '../lib/ai/types';
import { getAvailableTranslations, getBundledTranslations } from '../lib/bible/provider';
import { DEFAULT_TRANSLATION } from '../lib/bible/translations';
import type { TranslationInfo } from '../lib/bible/types';
import { loadPreferences, savePreferences } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface PreferencesContextValue {
  translation: string;
  translationInfo: TranslationInfo | undefined;
  translations: TranslationInfo[];
  availableTranslations: TranslationInfo[];
  explanationMode: ExplanationMode;
  audioEnabled: boolean;
  selectedTopics: string[];
  personalizationEnabled: boolean;
  setTranslation: (abbreviation: string) => void;
  setExplanationMode: (mode: ExplanationMode) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setSelectedTopics: (topics: string[]) => void;
  setPersonalizationEnabled: (enabled: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [local, setLocal] = useState(loadPreferences);
  const [translations, setTranslations] = useState<TranslationInfo[]>(getBundledTranslations);
  const loadedForUser = useRef<string | null>(null);

  // Ask the provider which translations can actually be served.
  useEffect(() => {
    let active = true;
    getAvailableTranslations().then((list) => {
      if (active) setTranslations(list);
    });
    return () => {
      active = false;
    };
  }, []);

  // A signed-in reader's stored preferences win over this browser's.
  useEffect(() => {
    if (!user || !supabase || loadedForUser.current === user.id) return;
    loadedForUser.current = user.id;
    supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLocal((current) =>
          savePreferences({
            ...current,
            translation: data.preferred_translation || current.translation,
            explanationMode: data.preferred_explanation_mode || current.explanationMode,
            audioEnabled: data.audio_enabled,
            selectedTopics: data.selected_topics ?? [],
            personalizationEnabled: data.personalization_enabled,
          }),
        );
      });
  }, [user]);

  useEffect(() => {
    if (!user) loadedForUser.current = null;
  }, [user]);

  const persist = useCallback(
    (patch: Partial<ReturnType<typeof loadPreferences>>) => {
      setLocal(savePreferences(patch));
      if (!user || !supabase) return;
      supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            ...(patch.translation !== undefined ? { preferred_translation: patch.translation } : {}),
            ...(patch.explanationMode !== undefined
              ? { preferred_explanation_mode: patch.explanationMode }
              : {}),
            ...(patch.audioEnabled !== undefined ? { audio_enabled: patch.audioEnabled } : {}),
            ...(patch.selectedTopics !== undefined ? { selected_topics: patch.selectedTopics } : {}),
            ...(patch.personalizationEnabled !== undefined
              ? { personalization_enabled: patch.personalizationEnabled }
              : {}),
          },
          { onConflict: 'user_id' },
        )
        .then(undefined, () => undefined);
    },
    [user],
  );

  const availableTranslations = useMemo(
    () => translations.filter((t) => t.isAvailable),
    [translations],
  );

  // Never leave the reader on a translation we cannot legally serve.
  const translation = useMemo(() => {
    if (availableTranslations.length === 0) return local.translation;
    return availableTranslations.some((t) => t.abbreviation === local.translation)
      ? local.translation
      : (availableTranslations[0]?.abbreviation ?? DEFAULT_TRANSLATION);
  }, [availableTranslations, local.translation]);

  const setTranslation = useCallback(
    (abbreviation: string) => {
      if (abbreviation === translation) return;
      trackEvent('bible_version_change', { from: translation, to: abbreviation });
      persist({ translation: abbreviation });
    },
    [persist, translation],
  );

  const setExplanationMode = useCallback(
    (mode: ExplanationMode) => {
      if (mode === local.explanationMode) return;
      trackEvent('explanation_mode_change', { mode });
      persist({ explanationMode: mode });
    },
    [local.explanationMode, persist],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      translation,
      translationInfo: translations.find((t) => t.abbreviation === translation),
      translations,
      availableTranslations,
      explanationMode: local.explanationMode,
      audioEnabled: local.audioEnabled,
      selectedTopics: local.selectedTopics,
      personalizationEnabled: local.personalizationEnabled,
      setTranslation,
      setExplanationMode,
      setAudioEnabled: (enabled: boolean) => persist({ audioEnabled: enabled }),
      setSelectedTopics: (topics: string[]) => persist({ selectedTopics: topics }),
      setPersonalizationEnabled: (enabled: boolean) => persist({ personalizationEnabled: enabled }),
    }),
    [translation, translations, availableTranslations, local, setTranslation, setExplanationMode, persist],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
