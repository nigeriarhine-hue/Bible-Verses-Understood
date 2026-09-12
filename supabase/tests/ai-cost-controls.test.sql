-- ============================================================================
-- Daily generation limits and the private devotional cache.
--
-- Run against a database with the migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ai-cost-controls.test.sql
--
-- Every assertion must hold or the script aborts. Between them they cover the
-- two claims the Edge Functions make and cannot prove on their own: that a
-- caller gets exactly the allowance they are entitled to however many
-- instances serve them, and that a personalised devotional written for one
-- reader cannot be handed to another.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ada@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'grace@example.test')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- A guest gets the guest allowance and not one more.
-- --------------------------------------------------------------------------
do $$
declare
  r record;
  allowed_count integer := 0;
begin
  for i in 1..6 loop
    select * into r from public.consume_ai_quota('situation', 'hash-of-a-guest', 2, 5);
    if r.allowed then allowed_count := allowed_count + 1; end if;
    if r.signed_in then raise exception 'a guest was counted as signed in'; end if;
    if r.quota <> 2 then raise exception 'a guest was offered a quota of %, expected 2', r.quota; end if;
  end loop;

  if allowed_count <> 2 then
    raise exception 'a guest was allowed % generations, expected exactly 2', allowed_count;
  end if;
end $$;

-- Being refused does not keep inflating the counter.
do $$
declare v_used integer;
begin
  select used into v_used from public.ai_usage
   where bucket = 'guest:hash-of-a-guest' and endpoint = 'situation' and usage_date = current_date;
  if v_used <> 2 then
    raise exception 'refused attempts still counted: used is %, expected 2', v_used;
  end if;
end $$;

-- A different guest has their own allowance.
do $$
declare r record;
begin
  select * into r from public.consume_ai_quota('situation', 'hash-of-another-guest', 2, 5);
  if not r.allowed then raise exception 'one guest exhausted another guest''s allowance'; end if;
end $$;

-- --------------------------------------------------------------------------
-- A signed-in reader gets the larger allowance, on their own bucket.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
declare
  r record;
  allowed_count integer := 0;
begin
  for i in 1..9 loop
    select * into r from public.consume_ai_quota('situation', 'hash-of-a-guest', 2, 5);
    if r.allowed then allowed_count := allowed_count + 1; end if;
    if not r.signed_in then raise exception 'a signed-in reader was counted as a guest'; end if;
    if r.quota <> 5 then raise exception 'a reader was offered a quota of %, expected 5', r.quota; end if;
  end loop;

  if allowed_count <> 5 then
    raise exception 'a signed-in reader was allowed % generations, expected exactly 5', allowed_count;
  end if;
end $$;

-- A signed-in reader is charged to their own bucket. The guest key they
-- happened to send along is ignored, and the guest bucket is untouched.
-- Checked as the owner, because a reader cannot read this table at all.
reset role;

do $$
declare v_guest integer; v_user integer;
begin
  select used into v_guest from public.ai_usage
   where bucket = 'guest:hash-of-a-guest' and endpoint = 'situation' and usage_date = current_date;
  select used into v_user from public.ai_usage
   where bucket = 'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and endpoint = 'situation' and usage_date = current_date;

  if v_guest <> 2 then
    raise exception 'a signed-in reader was charged to a guest bucket: it reads %, expected 2', v_guest;
  end if;
  if v_user <> 5 then
    raise exception 'the reader''s own bucket reads %, expected 5', v_user;
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Each endpoint is counted separately, so studying does not use up guidance.
do $$
declare r record;
begin
  select * into r from public.consume_ai_quota('study', 'hash-of-a-guest', 20, 50);
  if not r.allowed then raise exception 'an exhausted endpoint blocked a different one'; end if;
  if r.quota <> 50 then raise exception 'study offered a quota of %, expected 50', r.quota; end if;
end $$;

-- A quota of zero refuses from the very first request.
do $$
declare r record;
begin
  select * into r from public.consume_ai_quota('disabled-endpoint', 'hash-of-a-guest', 0, 0);
  if r.allowed then raise exception 'a quota of zero still allowed a generation'; end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.ai_usage where endpoint = 'disabled-endpoint') then
    raise exception 'a refused request still created a counter row';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- --------------------------------------------------------------------------
-- The counters themselves are out of reach of readers entirely — not filtered
-- by a policy, but refused, because the role holds no privilege on the table.
-- Only consume_ai_quota, which runs as its definer, can touch it.
-- --------------------------------------------------------------------------
do $$
begin
  begin
    perform count(*) from public.ai_usage;
    raise exception 'a reader could read the usage counters';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.ai_usage set used = 0;
    raise exception 'a reader could reset their own usage counters';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- A personalised devotional belongs to one reader.
-- --------------------------------------------------------------------------
insert into public.user_devotional_cache
  (user_id, cache_key, reference, translation, prompt_version, devotional_data)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'key-for-ada', 'John 3:16', 'KJV', 'v2',
   '{"title":"Ada''s devotional","isPersonalized":true}'::jsonb);

do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.user_devotional_cache;
  if v_rows <> 1 then raise exception 'a reader could not read back their own devotional'; end if;
end $$;

-- A reader cannot write one under somebody else's name.
do $$
begin
  begin
    insert into public.user_devotional_cache
      (user_id, cache_key, reference, translation, prompt_version, devotional_data)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'planted', 'John 3:16', 'KJV', 'v2', '{}'::jsonb);
    raise exception 'a reader planted a devotional in another reader''s cache';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- The other reader cannot see it, even knowing the key.
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.user_devotional_cache where cache_key = 'key-for-ada';
  if v_rows <> 0 then
    raise exception 'one reader was served another reader''s personalised devotional';
  end if;

  update public.user_devotional_cache set devotional_data = '{}'::jsonb where cache_key = 'key-for-ada';
  if found then raise exception 'one reader overwrote another reader''s devotional'; end if;

  delete from public.user_devotional_cache where cache_key = 'key-for-ada';
  if found then raise exception 'one reader deleted another reader''s devotional'; end if;
end $$;

-- A guest is refused the table outright, not merely filtered out of it.
set local role anon;
set local request.jwt.claim.sub = '';

do $$
begin
  begin
    perform count(*) from public.user_devotional_cache;
    raise exception 'a signed-out visitor could read personalised devotionals';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- The shared study cache is still public reference data, as it was.
do $$
begin
  perform 1 from public.study_cache limit 1;
end $$;

reset role;

rollback;

\echo 'AI cost controls: all assertions held.'
