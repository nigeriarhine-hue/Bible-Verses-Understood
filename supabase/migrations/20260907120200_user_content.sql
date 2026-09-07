-- ============================================================================
-- Private, per-reader content: saved verses and studies, collections, history,
-- devotionals, conversations and share cards.
--
-- Signed-out readers keep the equivalent state in local storage; nothing here
-- accepts anonymous writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- saved_verses
-- ---------------------------------------------------------------------------
create table if not exists public.saved_verses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null,
  book text not null,
  chapter integer not null,
  start_verse integer not null,
  end_verse integer,
  translation text not null,
  verse_text text,
  created_at timestamptz not null default now(),
  -- Saving the same passage in the same translation twice is a no-op, not a
  -- duplicate row.
  constraint saved_verses_unique unique (user_id, reference, translation)
);

create index if not exists saved_verses_user_idx on public.saved_verses (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- saved_studies
-- ---------------------------------------------------------------------------
create table if not exists public.saved_studies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null,
  translation text not null,
  explanation_mode text not null,
  study_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_studies_unique unique (user_id, reference, translation, explanation_mode),
  constraint saved_studies_mode_check
    check (explanation_mode in ('simple', 'deep', 'scholar'))
);

create trigger saved_studies_set_updated_at
  before update on public.saved_studies
  for each row execute function public.set_updated_at();

create index if not exists saved_studies_user_idx on public.saved_studies (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_name_unique unique (user_id, name)
);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create index if not exists collections_user_idx on public.collections (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- collection_verses
-- ---------------------------------------------------------------------------
create table if not exists public.collection_verses (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  saved_verse_id uuid not null references public.saved_verses(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint collection_verses_unique unique (collection_id, saved_verse_id)
);

create index if not exists collection_verses_collection_idx on public.collection_verses (collection_id);
create index if not exists collection_verses_verse_idx on public.collection_verses (saved_verse_id);

-- ---------------------------------------------------------------------------
-- study_history
-- ---------------------------------------------------------------------------
create table if not exists public.study_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  reference text not null,
  translation text,
  explanation_mode text,
  source text,
  viewed_at timestamptz not null default now(),
  constraint study_history_source_check check (
    source is null
    or source in ('search', 'related_scripture', 'topic', 'daily', 'history', 'saved', 'life_situation', 'browse')
  )
);

create index if not exists study_history_user_idx on public.study_history (user_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- study_navigation — the Related Scripture trail
-- ---------------------------------------------------------------------------
create table if not exists public.study_navigation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text not null,
  from_reference text,
  to_reference text not null,
  translation text,
  created_at timestamptz not null default now()
);

create index if not exists study_navigation_session_idx on public.study_navigation (session_id, created_at);
create index if not exists study_navigation_user_idx on public.study_navigation (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- devotionals
--
-- user_id is null for the shared devotional of the day, which every reader may
-- see. Rows with a user_id are personalised and private.
-- ---------------------------------------------------------------------------
create table if not exists public.devotionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  verse_date date not null,
  reference text not null,
  translation text not null,
  content jsonb not null,
  is_personalized boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists devotionals_user_date_idx on public.devotionals (user_id, verse_date desc);
create unique index if not exists devotionals_shared_unique
  on public.devotionals (verse_date, translation)
  where user_id is null;

-- ---------------------------------------------------------------------------
-- conversations / conversation_messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  reference text not null,
  translation text,
  explanation_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint conversation_messages_role_check check (role in ('user', 'assistant', 'system'))
);

create index if not exists conversation_messages_conversation_idx
  on public.conversation_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- share_cards
-- ---------------------------------------------------------------------------
create table if not exists public.share_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reference text not null,
  translation text,
  background_style text,
  created_at timestamptz not null default now()
);

create index if not exists share_cards_user_idx on public.share_cards (user_id, created_at desc);
