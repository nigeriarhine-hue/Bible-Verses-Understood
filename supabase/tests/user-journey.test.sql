-- ============================================================================
-- The signed-in reader's journey, exercised end to end against real policies.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/user-journey.test.sql
--
-- Every step runs as an ordinary authenticated user, never as a superuser, so
-- what passes here is what RLS actually permits. Each step raises if it fails.
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'reader-a@example.test', '{"display_name":"Reader A"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'reader-b@example.test', '{}'::jsonb)
on conflict (id) do nothing;

\echo ''
\echo 'Signed-in reader journey'

-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare n integer; v uuid; c uuid; txt text;
begin
  -- 1. A profile is created automatically on sign-up.
  select count(*) into n from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: profile was not created on sign-up'; end if;
  select display_name into txt from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if txt <> 'Reader A' then raise exception 'FAIL: display_name not taken from sign-up metadata (got %)', txt; end if;
  raise notice '  PASS  profile created automatically on sign-up (display_name = %)', txt;

  -- 2. Preferences are created automatically, with the documented defaults.
  select count(*) into n from public.user_preferences where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: preferences row was not created'; end if;
  select preferred_translation into txt from public.user_preferences where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if txt <> 'KJV' then raise exception 'FAIL: default translation is % not KJV', txt; end if;
  raise notice '  PASS  preferences created automatically (default translation = %)', txt;

  -- 3. Changing the translation preference persists (KJV -> ESV).
  update public.user_preferences
     set preferred_translation = 'ESV', preferred_explanation_mode = 'deep',
         selected_topics = array['anxiety','purpose'], audio_enabled = false
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select preferred_translation into txt from public.user_preferences where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if txt <> 'ESV' then raise exception 'FAIL: translation preference did not persist'; end if;
  raise notice '  PASS  translation preference saved and read back (KJV -> %)', txt;

  -- 4. An invalid explanation mode is rejected by the check constraint.
  begin
    update public.user_preferences set preferred_explanation_mode = 'wizard'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL: an invalid explanation mode was accepted';
  exception when check_violation then
    raise notice '  PASS  invalid explanation mode rejected by constraint';
  end;

  -- 5. Save a verse.
  insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation, verse_text)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'John 3:16', 'John', 3, 16, 'KJV', 'For God so loved the world...')
  returning id into v;
  raise notice '  PASS  verse saved';

  -- 6. Saving the same verse again must not duplicate it.
  insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation, verse_text)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'John 3:16', 'John', 3, 16, 'KJV', 'For God so loved the world...')
  on conflict (user_id, reference, translation) do nothing;
  select count(*) into n from public.saved_verses where reference = 'John 3:16';
  if n <> 1 then raise exception 'FAIL: saving twice produced % rows', n; end if;
  raise notice '  PASS  saving the same verse twice is a no-op, not a duplicate';

  -- 7. Save a study.
  insert into public.saved_studies (user_id, reference, translation, explanation_mode, study_data)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'John 3:16', 'KJV', 'simple', '{"summary":"..."}'::jsonb);
  raise notice '  PASS  study saved';

  -- 8. Create a collection and put the verse in it.
  insert into public.collections (user_id, name, description)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Favorites', 'Verses to return to')
  returning id into c;
  insert into public.collection_verses (collection_id, saved_verse_id) values (c, v);
  select count(*) into n from public.collection_verses where collection_id = c;
  if n <> 1 then raise exception 'FAIL: verse was not added to the collection'; end if;
  raise notice '  PASS  collection created and verse added to it';

  -- 9. The same verse can live in a second collection.
  insert into public.collections (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Hope') returning id into c;
  insert into public.collection_verses (collection_id, saved_verse_id) values (c, v);
  select count(*) into n from public.collection_verses where saved_verse_id = v;
  if n <> 2 then raise exception 'FAIL: verse is in % collections, expected 2', n; end if;
  raise notice '  PASS  one verse belongs to two collections';

  -- 10. Remove it from one collection without deleting the verse.
  delete from public.collection_verses where collection_id = c and saved_verse_id = v;
  select count(*) into n from public.saved_verses where id = v;
  if n <> 1 then raise exception 'FAIL: removing from a collection deleted the saved verse'; end if;
  raise notice '  PASS  removed from a collection, saved verse intact';

  -- 11. Study history, across every documented source.
  insert into public.study_history (user_id, reference, translation, explanation_mode, source) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'John 3:16',     'KJV', 'simple',  'search'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Genesis 50:20', 'KJV', 'deep',    'related_scripture'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Psalms 23:1',   'KJV', 'simple',  'topic'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Romans 8:28',   'KJV', 'scholar', 'daily'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'James 1:2-4',   'KJV', 'simple',  'saved'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Isaiah 41:10',  'KJV', 'simple',  'life_situation');
  select count(*) into n from public.study_history;
  if n <> 6 then raise exception 'FAIL: expected 6 history rows, got %', n; end if;
  raise notice '  PASS  study history recorded for all 6 sources';

  -- 12. An undocumented source is rejected.
  begin
    insert into public.study_history (user_id, reference, source)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'John 1:1', 'telepathy');
    raise exception 'FAIL: an unknown history source was accepted';
  exception when check_violation then
    raise notice '  PASS  unknown history source rejected by constraint';
  end;

  -- 13. The Related Scripture trail.
  insert into public.study_navigation (user_id, session_id, from_reference, to_reference, translation) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 's1', null,            'Romans 8:28',   'KJV'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 's1', 'Romans 8:28',   'Genesis 50:20', 'KJV'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 's1', 'Genesis 50:20', 'Proverbs 19:21','KJV');
  select string_agg(to_reference, ' -> ' order by created_at) into txt
    from public.study_navigation where session_id = 's1';
  raise notice '  PASS  navigation trail stored: %', txt;
end $$;

-- --------------------------------------------------------------------------
\echo ''
\echo 'Isolation between readers'

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

do $$
declare n integer; other_collection uuid; other_verse uuid;
begin
  select count(*) into n from public.saved_verses;      if n <> 0 then raise exception 'FAIL: reader B saw % saved verses', n; end if;
  select count(*) into n from public.saved_studies;     if n <> 0 then raise exception 'FAIL: reader B saw % saved studies', n; end if;
  select count(*) into n from public.collections;       if n <> 0 then raise exception 'FAIL: reader B saw % collections', n; end if;
  select count(*) into n from public.collection_verses; if n <> 0 then raise exception 'FAIL: reader B saw % collection entries', n; end if;
  select count(*) into n from public.study_history;     if n <> 0 then raise exception 'FAIL: reader B saw % history rows', n; end if;
  select count(*) into n from public.study_navigation;  if n <> 0 then raise exception 'FAIL: reader B saw % navigation rows', n; end if;
  select count(*) into n from public.profiles where id <> 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: reader B saw % other profiles', n; end if;
  select count(*) into n from public.user_preferences where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: reader B saw % other preference rows', n; end if;
  raise notice '  PASS  reader B sees none of reader A''s data across 8 private tables';

  update public.saved_verses set verse_text = 'tampered';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: reader B updated % of reader A''s rows', n; end if;
  delete from public.collections;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: reader B deleted % of reader A''s collections', n; end if;
  raise notice '  PASS  reader B cannot update or delete reader A''s rows';

  -- Reader B cannot smuggle their verse into reader A's collection.
  reset role;
  select id into other_collection from public.collections where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  insert into public.saved_verses (user_id, reference, book, chapter, start_verse, translation)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'John 1:1', 'John', 1, 1, 'KJV') returning id into other_verse;
  begin
    insert into public.collection_verses (collection_id, saved_verse_id) values (other_collection, other_verse);
    raise exception 'FAIL: reader B wrote into reader A''s collection';
  exception when insufficient_privilege then
    raise notice '  PASS  reader B cannot write into reader A''s collection';
  end;
end $$;

-- --------------------------------------------------------------------------
\echo ''
\echo 'Guest (anonymous) access'

reset role;
set local role anon;
set local request.jwt.claim.sub = '';

do $$
declare n integer;
begin
  select count(*) into n from public.topics;              if n < 50 then raise exception 'FAIL: guests cannot browse topics'; end if;
  select count(*) into n from public.topic_verses;        if n < 300 then raise exception 'FAIL: guests cannot read topic verses'; end if;
  select count(*) into n from public.daily_verses;        if n = 0 then raise exception 'FAIL: guests cannot read the Verse of the Day'; end if;
  select count(*) into n from public.bible_translations;  if n < 20 then raise exception 'FAIL: guests cannot read translations'; end if;
  raise notice '  PASS  guests can read all four public reference tables';

  select count(*) into n from public.saved_verses;   if n <> 0 then raise exception 'FAIL: guest saw saved verses'; end if;
  select count(*) into n from public.study_history;  if n <> 0 then raise exception 'FAIL: guest saw study history'; end if;
  select count(*) into n from public.profiles;       if n <> 0 then raise exception 'FAIL: guest saw profiles'; end if;
  select count(*) into n from public.conversations;  if n <> 0 then raise exception 'FAIL: guest saw conversations'; end if;
  raise notice '  PASS  guests see no private data at all';

  begin
    insert into public.topics (slug, name) values ('injected', 'Injected');
    raise exception 'FAIL: a guest inserted a topic';
  exception when insufficient_privilege then
    raise notice '  PASS  guests cannot write reference data';
  end;

  -- With no UPDATE policy, RLS filters the row out rather than raising, so the
  -- update simply touches nothing. Report either outcome explicitly.
  begin
    update public.bible_translations set is_available = true where abbreviation = 'NIV';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: a guest changed % translation rows', n; end if;
    raise notice '  PASS  guests cannot mark a licensed translation available (0 rows affected)';
  exception when insufficient_privilege then
    raise notice '  PASS  guests cannot mark a licensed translation available (refused)';
  end;

  -- And confirm NIV is still unavailable afterwards.
  select count(*) into n from public.bible_translations where abbreviation = 'NIV' and is_available;
  if n <> 0 then raise exception 'FAIL: NIV is marked available without a licensed provider'; end if;
  raise notice '  PASS  NIV remains unavailable (no licensed provider configured)';
end $$;

rollback;

\echo ''
\echo 'User journey: all checks passed.'
