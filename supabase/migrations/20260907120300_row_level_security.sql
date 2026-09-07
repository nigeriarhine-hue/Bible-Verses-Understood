-- ============================================================================
-- Row Level Security
--
-- Every table has RLS enabled. Private tables are reachable only by their
-- owner (auth.uid() = user_id); relational tables authorise through the parent
-- row's owner. Public reference tables allow anonymous SELECT and no writes —
-- only the service role (which bypasses RLS) may change them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private: profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Readers can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Readers can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Readers can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Readers can delete their own profile"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Private: user_preferences
-- ---------------------------------------------------------------------------
alter table public.user_preferences enable row level security;

create policy "Readers can view their own preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can create their own preferences"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own preferences"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own preferences"
  on public.user_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: saved_verses
-- ---------------------------------------------------------------------------
alter table public.saved_verses enable row level security;

create policy "Readers can view their own saved verses"
  on public.saved_verses for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can save verses to their own account"
  on public.saved_verses for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own saved verses"
  on public.saved_verses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can remove their own saved verses"
  on public.saved_verses for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: saved_studies
-- ---------------------------------------------------------------------------
alter table public.saved_studies enable row level security;

create policy "Readers can view their own saved studies"
  on public.saved_studies for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can save studies to their own account"
  on public.saved_studies for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own saved studies"
  on public.saved_studies for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can remove their own saved studies"
  on public.saved_studies for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: collections
-- ---------------------------------------------------------------------------
alter table public.collections enable row level security;

create policy "Readers can view their own collections"
  on public.collections for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can create their own collections"
  on public.collections for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own collections"
  on public.collections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own collections"
  on public.collections for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: collection_verses — authorised through the parent collection
-- ---------------------------------------------------------------------------
alter table public.collection_verses enable row level security;

create policy "Readers can view verses in their own collections"
  on public.collection_verses for select to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_verses.collection_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "Readers can add their own verses to their own collections"
  on public.collection_verses for insert to authenticated
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_verses.collection_id
        and c.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.saved_verses v
      where v.id = collection_verses.saved_verse_id
        and v.user_id = (select auth.uid())
    )
  );

create policy "Readers can remove verses from their own collections"
  on public.collection_verses for delete to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_verses.collection_id
        and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Private: study_history
-- ---------------------------------------------------------------------------
alter table public.study_history enable row level security;

create policy "Readers can view their own study history"
  on public.study_history for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can record their own study history"
  on public.study_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can clear their own study history"
  on public.study_history for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: study_navigation
-- ---------------------------------------------------------------------------
alter table public.study_navigation enable row level security;

create policy "Readers can view their own navigation trail"
  on public.study_navigation for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can record their own navigation trail"
  on public.study_navigation for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can clear their own navigation trail"
  on public.study_navigation for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Devotionals — personal rows are private; the shared daily devotional
-- (user_id is null) is public reference content.
-- ---------------------------------------------------------------------------
alter table public.devotionals enable row level security;

create policy "Anyone can read the shared devotional of the day"
  on public.devotionals for select to anon, authenticated
  using (user_id is null);

create policy "Readers can view their own devotionals"
  on public.devotionals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can save their own devotionals"
  on public.devotionals for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own devotionals"
  on public.devotionals for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: conversations
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;

create policy "Readers can view their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can start their own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own conversations"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private: conversation_messages — authorised through the parent conversation
-- ---------------------------------------------------------------------------
alter table public.conversation_messages enable row level security;

create policy "Readers can view messages in their own conversations"
  on public.conversation_messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "Readers can add messages to their own conversations"
  on public.conversation_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "Readers can delete messages in their own conversations"
  on public.conversation_messages for delete to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Private: share_cards
-- ---------------------------------------------------------------------------
alter table public.share_cards enable row level security;

create policy "Readers can view their own share cards"
  on public.share_cards for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can create their own share cards"
  on public.share_cards for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own share cards"
  on public.share_cards for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Public reference tables: readable by everyone, writable only by the service
-- role (which bypasses RLS). No insert/update/delete policies are defined, so
-- anon and authenticated cannot write.
-- ---------------------------------------------------------------------------
alter table public.bible_translations enable row level security;
create policy "Bible translations are public reference data"
  on public.bible_translations for select to anon, authenticated
  using (true);

alter table public.topics enable row level security;
create policy "Topics are public reference data"
  on public.topics for select to anon, authenticated
  using (is_active);

alter table public.topic_verses enable row level security;
create policy "Topic verses are public reference data"
  on public.topic_verses for select to anon, authenticated
  using (true);

alter table public.daily_verses enable row level security;
create policy "Daily verses are public reference data"
  on public.daily_verses for select to anon, authenticated
  using (true);

alter table public.study_cache enable row level security;
create policy "Cached studies are public reference data"
  on public.study_cache for select to anon, authenticated
  using (true);
