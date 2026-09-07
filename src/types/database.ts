/**
 * Database types for the `public` schema.
 *
 * Mirrors supabase/migrations/*.sql. Regenerate against a live project with:
 *   npm run db:types      (supabase gen types typescript --local)
 * and keep the hand-written docs below if you do.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ExplanationMode = 'simple' | 'deep' | 'scholar';

export type StudySource =
  | 'search'
  | 'related_scripture'
  | 'topic'
  | 'daily'
  | 'history'
  | 'saved'
  | 'life_situation'
  | 'browse';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          preferred_translation: string;
          preferred_explanation_mode: ExplanationMode;
          selected_topics: string[];
          audio_enabled: boolean;
          personalization_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          preferred_translation?: string;
          preferred_explanation_mode?: ExplanationMode;
          selected_topics?: string[];
          audio_enabled?: boolean;
          personalization_enabled?: boolean;
        };
        Update: {
          preferred_translation?: string;
          preferred_explanation_mode?: ExplanationMode;
          selected_topics?: string[];
          audio_enabled?: boolean;
          personalization_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      bible_translations: {
        Row: {
          id: string;
          provider_translation_id: string | null;
          abbreviation: string;
          name: string;
          language: string;
          provider: string | null;
          is_available: boolean;
          is_public_domain: boolean;
          copyright_notice: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          abbreviation: string;
          name: string;
          provider_translation_id?: string | null;
          language?: string;
          provider?: string | null;
          is_available?: boolean;
          is_public_domain?: boolean;
          copyright_notice?: string | null;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['bible_translations']['Insert']>;
        Relationships: [];
      };
      saved_verses: {
        Row: {
          id: string;
          user_id: string;
          reference: string;
          book: string;
          chapter: number;
          start_verse: number;
          end_verse: number | null;
          translation: string;
          verse_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          reference: string;
          book: string;
          chapter: number;
          start_verse: number;
          end_verse?: number | null;
          translation: string;
          verse_text?: string | null;
        };
        Update: Partial<Database['public']['Tables']['saved_verses']['Insert']>;
        Relationships: [];
      };
      saved_studies: {
        Row: {
          id: string;
          user_id: string;
          reference: string;
          translation: string;
          explanation_mode: ExplanationMode;
          study_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          reference: string;
          translation: string;
          explanation_mode: ExplanationMode;
          study_data: Json;
        };
        Update: Partial<Database['public']['Tables']['saved_studies']['Insert']>;
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; user_id: string; name: string; description?: string | null };
        Update: { name?: string; description?: string | null; updated_at?: string };
        Relationships: [];
      };
      collection_verses: {
        Row: {
          id: string;
          collection_id: string;
          saved_verse_id: string;
          created_at: string;
        };
        Insert: { id?: string; collection_id: string; saved_verse_id: string };
        Update: never;
        Relationships: [];
      };
      study_history: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string | null;
          reference: string;
          translation: string | null;
          explanation_mode: ExplanationMode | null;
          source: StudySource | null;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          session_id?: string | null;
          reference: string;
          translation?: string | null;
          explanation_mode?: ExplanationMode | null;
          source?: StudySource | null;
          viewed_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      study_navigation: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string;
          from_reference: string | null;
          to_reference: string;
          translation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          session_id: string;
          from_reference?: string | null;
          to_reference: string;
          translation?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['topics']['Insert']>;
        Relationships: [];
      };
      topic_verses: {
        Row: {
          id: string;
          topic_id: string;
          reference: string;
          relevance_note: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          topic_id: string;
          reference: string;
          relevance_note?: string | null;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['topic_verses']['Insert']>;
        Relationships: [];
      };
      daily_verses: {
        Row: {
          id: string;
          verse_date: string;
          reference: string;
          default_translation: string;
          featured_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          verse_date: string;
          reference: string;
          default_translation?: string;
          featured_note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['daily_verses']['Insert']>;
        Relationships: [];
      };
      devotionals: {
        Row: {
          id: string;
          user_id: string | null;
          verse_date: string;
          reference: string;
          translation: string;
          content: Json;
          is_personalized: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          verse_date: string;
          reference: string;
          translation: string;
          content: Json;
          is_personalized?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string | null;
          reference: string;
          translation: string | null;
          explanation_mode: ExplanationMode | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          session_id?: string | null;
          reference: string;
          translation?: string | null;
          explanation_mode?: ExplanationMode | null;
        };
        Update: { updated_at?: string };
        Relationships: [];
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
        };
        Update: never;
        Relationships: [];
      };
      share_cards: {
        Row: {
          id: string;
          user_id: string | null;
          reference: string;
          translation: string | null;
          background_style: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          reference: string;
          translation?: string | null;
          background_style?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      study_cache: {
        Row: {
          id: string;
          cache_key: string;
          reference: string;
          translation: string;
          explanation_mode: ExplanationMode;
          prompt_version: string;
          study_data: Json;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          reference: string;
          translation: string;
          explanation_mode: ExplanationMode;
          prompt_version: string;
          study_data: Json;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
