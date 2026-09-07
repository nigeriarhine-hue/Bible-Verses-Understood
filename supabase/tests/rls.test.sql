-- ============================================================================
-- Row Level Security checks.
--
-- Run against a database with the migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
--
-- Every assertion below must hold, or the script aborts. It proves a reader
-- cannot see, change, or delete another reader's data, that anonymous visitors
-- can read public reference content but not write it, and that anonymous
-- visitors cannot write user content at all.
-- ============================================================================

begin;

-- Two readers to test isolation between.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'grace@example.test')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'handle_new_user did not create a profile for the new user';
  end if;
  if not exists (select 1 from public.user_preferences where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'handle_new_user did not create preferences for the new user';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- Reader A writes some private content.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation, verse_text)
values ('11111111-1111-1111-1111-111111111111', 'Romans 8:28', 'Romans', 8, 28, 'KJV', 'And we know...');

insert into public.collections (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Favorites');

insert into public.collection_verses (collection_id, saved_verse_id)
select c.id, v.id
from public.collections c, public.saved_verses v
where c.user_id = '11111111-1111-1111-1111-111111111111'
  and v.user_id = '11111111-1111-1111-1111-111111111111';

insert into public.study_history (user_id, reference, translation, explanation_mode, source)
values ('11111111-1111-1111-1111-111111111111', 'Romans 8:28', 'KJV', 'simple', 'search');

insert into public.conversations (id, user_id, reference, translation, explanation_mode)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Romans 8:28', 'KJV', 'simple');

insert into public.conversation_messages (conversation_id, role, content)
values ('33333333-3333-3333-3333-333333333333', 'user', 'What happened before this verse?');

do $$
begin
  if (select count(*) from public.saved_verses) <> 1 then
    raise exception 'reader A cannot see their own saved verse';
  end if;
  if (select count(*) from public.collection_verses) <> 1 then
    raise exception 'reader A cannot see verses in their own collection';
  end if;
  if (select count(*) from public.conversation_messages) <> 1 then
    raise exception 'reader A cannot see their own conversation messages';
  end if;
end $$;

-- A reader cannot write a row that claims to belong to somebody else.
do $$
begin
  begin
    insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation)
    values ('22222222-2222-2222-2222-222222222222', 'John 3:16', 'John', 3, 16, 'KJV');
    raise exception 'RLS FAILED: reader A saved a verse into reader B''s account';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- Reader B must not see any of it.
-- --------------------------------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  leaked integer;
begin
  select count(*) into leaked from public.saved_verses;
  if leaked <> 0 then raise exception 'RLS FAILED: saved_verses leaked % rows', leaked; end if;

  select count(*) into leaked from public.saved_studies;
  if leaked <> 0 then raise exception 'RLS FAILED: saved_studies leaked % rows', leaked; end if;

  select count(*) into leaked from public.collections;
  if leaked <> 0 then raise exception 'RLS FAILED: collections leaked % rows', leaked; end if;

  select count(*) into leaked from public.collection_verses;
  if leaked <> 0 then raise exception 'RLS FAILED: collection_verses leaked % rows', leaked; end if;

  select count(*) into leaked from public.study_history;
  if leaked <> 0 then raise exception 'RLS FAILED: study_history leaked % rows', leaked; end if;

  select count(*) into leaked from public.conversations;
  if leaked <> 0 then raise exception 'RLS FAILED: conversations leaked % rows', leaked; end if;

  select count(*) into leaked from public.conversation_messages;
  if leaked <> 0 then raise exception 'RLS FAILED: conversation_messages leaked % rows', leaked; end if;

  select count(*) into leaked from public.profiles where id <> '22222222-2222-2222-2222-222222222222';
  if leaked <> 0 then raise exception 'RLS FAILED: profiles leaked % rows', leaked; end if;

  select count(*) into leaked from public.user_preferences
    where user_id <> '22222222-2222-2222-2222-222222222222';
  if leaked <> 0 then raise exception 'RLS FAILED: user_preferences leaked % rows', leaked; end if;
end $$;

-- Reader B's updates and deletes must not reach reader A's rows.
do $$
declare
  touched integer;
begin
  update public.saved_verses set verse_text = 'tampered';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'RLS FAILED: reader B updated % of reader A''s rows', touched; end if;

  delete from public.collections;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'RLS FAILED: reader B deleted % of reader A''s collections', touched; end if;
end $$;

-- Reader B cannot attach their own verse to reader A's collection.
do $$
declare
  other_collection uuid;
begin
  reset role;
  select id into other_collection from public.collections
   where user_id = '11111111-1111-1111-1111-111111111111' limit 1;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation)
  values ('22222222-2222-2222-2222-222222222222', 'John 3:16', 'John', 3, 16, 'KJV');

  begin
    insert into public.collection_verses (collection_id, saved_verse_id)
    select other_collection, id from public.saved_verses
     where user_id = '22222222-2222-2222-2222-222222222222' limit 1;
    raise exception 'RLS FAILED: reader B wrote into reader A''s collection';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- Anonymous visitors: public reference content is readable, nothing else.
-- --------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claim.sub = '';

do $$
declare
  visible integer;
begin
  select count(*) into visible from public.topics;
  if visible < 50 then raise exception 'anonymous readers cannot browse topics (saw %)', visible; end if;

  select count(*) into visible from public.bible_translations where is_available;
  if visible <> 4 then raise exception 'expected 4 available translations, saw %', visible; end if;

  select count(*) into visible from public.daily_verses;
  if visible = 0 then raise exception 'anonymous readers cannot read the Verse of the Day'; end if;

  select count(*) into visible from public.topic_verses;
  if visible = 0 then raise exception 'anonymous readers cannot read topic verses'; end if;

  -- Private tables must be empty for an anonymous visitor.
  select count(*) into visible from public.saved_verses;
  if visible <> 0 then raise exception 'RLS FAILED: anonymous visitor saw % saved verses', visible; end if;

  select count(*) into visible from public.study_history;
  if visible <> 0 then raise exception 'RLS FAILED: anonymous visitor saw % history rows', visible; end if;

  select count(*) into visible from public.conversations;
  if visible <> 0 then raise exception 'RLS FAILED: anonymous visitor saw % conversations', visible; end if;

  select count(*) into visible from public.profiles;
  if visible <> 0 then raise exception 'RLS FAILED: anonymous visitor saw % profiles', visible; end if;
end $$;

-- Anonymous visitors cannot write reference content.
do $$
begin
  begin
    insert into public.topics (slug, name) values ('injected', 'Injected');
    raise exception 'RLS FAILED: anonymous visitor inserted a topic';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.bible_translations set is_available = true where abbreviation = 'NIV';
    if found then raise exception 'RLS FAILED: anonymous visitor marked a licensed translation available'; end if;
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation)
    values ('11111111-1111-1111-1111-111111111111', 'John 3:16', 'John', 3, 16, 'KJV');
    raise exception 'RLS FAILED: anonymous visitor wrote a saved verse';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- The shared devotional (user_id is null) is public; personal ones are not.
-- --------------------------------------------------------------------------
reset role;
insert into public.devotionals (user_id, verse_date, reference, translation, content, is_personalized)
values
  (null, current_date, 'Romans 8:28', 'KJV', '{"thought":"shared"}'::jsonb, false),
  ('11111111-1111-1111-1111-111111111111', current_date, 'Romans 8:28', 'KJV', '{"thought":"private"}'::jsonb, true);

set local role anon;
do $$
declare
  visible integer;
begin
  select count(*) into visible from public.devotionals;
  if visible <> 1 then
    raise exception 'expected only the shared devotional to be public, saw %', visible;
  end if;
end $$;

reset role;

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if unprotected is not null then
    raise exception 'RLS is not enabled on: %', unprotected;
  end if;
end $$;

rollback;

\echo 'RLS checks passed.'
