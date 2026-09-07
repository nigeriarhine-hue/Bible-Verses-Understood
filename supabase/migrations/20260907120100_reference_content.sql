-- ============================================================================
-- Public reference content: translations, topics, curated topic verses and the
-- shared Verse of the Day. Anonymous readers may SELECT these; only the service
-- role may write them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- bible_translations
-- ---------------------------------------------------------------------------
create table if not exists public.bible_translations (
  id uuid primary key default gen_random_uuid(),
  provider_translation_id text,
  abbreviation text not null unique,
  name text not null,
  language text not null default 'English',
  provider text,
  is_available boolean not null default false,
  is_public_domain boolean not null default false,
  copyright_notice text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.bible_translations.is_available is
  'True only when the connected Bible provider legally permits serving this translation.';

create trigger bible_translations_set_updated_at
  before update on public.bible_translations
  for each row execute function public.set_updated_at();

create index if not exists bible_translations_available_idx
  on public.bible_translations (is_available, sort_order);

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create index if not exists topics_active_idx on public.topics (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- topic_verses
-- ---------------------------------------------------------------------------
create table if not exists public.topic_verses (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  reference text not null,
  relevance_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint topic_verses_unique unique (topic_id, reference)
);

create index if not exists topic_verses_topic_idx on public.topic_verses (topic_id, sort_order);

-- ---------------------------------------------------------------------------
-- daily_verses
-- ---------------------------------------------------------------------------
create table if not exists public.daily_verses (
  id uuid primary key default gen_random_uuid(),
  verse_date date not null unique,
  reference text not null,
  default_translation text not null default 'KJV',
  featured_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger daily_verses_set_updated_at
  before update on public.daily_verses
  for each row execute function public.set_updated_at();

create index if not exists daily_verses_date_idx on public.daily_verses (verse_date desc);

-- ---------------------------------------------------------------------------
-- study_cache
--
-- A shared, non-personal cache of generated commentary so the same passage in
-- the same translation and mode is not regenerated for every reader. Contains
-- no user data. Written only by Edge Functions using the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.study_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  reference text not null,
  translation text not null,
  explanation_mode text not null,
  prompt_version text not null,
  study_data jsonb not null,
  created_at timestamptz not null default now(),
  -- Also caches the shared devotional and life-situation responses, which are
  -- generated the same way and are equally non-personal.
  constraint study_cache_mode_check
    check (explanation_mode in ('simple', 'deep', 'scholar', 'devotional', 'situation'))
);

create index if not exists study_cache_lookup_idx
  on public.study_cache (reference, translation, explanation_mode, prompt_version);
