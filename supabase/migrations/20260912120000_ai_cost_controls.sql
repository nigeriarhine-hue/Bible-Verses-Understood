-- ============================================================================
-- AI cost controls
--
-- Two things the Edge Functions could not do on their own:
--
--   1. Count generations across instances. The previous limiter lived in a Map
--      inside one isolate, so it reset on every cold start and knew nothing
--      about the other instances running beside it. A caller willing to wait
--      out a restart was not limited at all.
--
--   2. Cache a personalised devotional without sharing it. The existing
--      study_cache is readable by everyone by design, so anything written
--      there is public. A devotional shaped by what one reader said matters to
--      them belongs in a table where the database itself refuses to hand it to
--      anybody else.
--
-- Both are additive. Nothing existing is altered, and re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_usage
--
-- One row per bucket, endpoint and day. A bucket is a signed-in reader's id,
-- or a hash of whatever identified a guest — never an address in the clear.
--
-- No policies are defined, so with RLS on, anon and authenticated cannot read
-- or write it at all. Only consume_ai_quota touches it, and that runs as its
-- definer.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  bucket text not null,
  endpoint text not null,
  usage_date date not null default current_date,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, endpoint, usage_date)
);

alter table public.ai_usage enable row level security;

-- Spelled out rather than left to the project's default privileges: a reader
-- who could reset their own counter would have no limit at all.
revoke all on public.ai_usage from anon, authenticated;

comment on table public.ai_usage is
  'Daily Gemini generation counters. Written only by consume_ai_quota.';

-- ---------------------------------------------------------------------------
-- user_devotional_cache
--
-- A personalised devotional, private to the reader it was written for. The
-- cache key already carries the reader''s id, and the policies below mean the
-- database will not return a row to anyone else even if a key were guessed.
-- ---------------------------------------------------------------------------
create table if not exists public.user_devotional_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cache_key text not null,
  reference text not null,
  translation text not null,
  prompt_version text not null,
  devotional_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

create index if not exists user_devotional_cache_owner_idx
  on public.user_devotional_cache (user_id, cache_key);

alter table public.user_devotional_cache enable row level security;

-- The policies below are what isolates readers; these grants are what lets a
-- reader reach their own rows at all. Stated here so the table does not depend
-- on a default privilege staying in place.
grant select, insert, update, delete on public.user_devotional_cache to authenticated;
revoke all on public.user_devotional_cache from anon;

drop policy if exists "Readers can view their own devotionals" on public.user_devotional_cache;
create policy "Readers can view their own devotionals"
  on public.user_devotional_cache for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Readers can store their own devotionals" on public.user_devotional_cache;
create policy "Readers can store their own devotionals"
  on public.user_devotional_cache for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Readers can refresh their own devotionals" on public.user_devotional_cache;
create policy "Readers can refresh their own devotionals"
  on public.user_devotional_cache for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Readers can remove their own devotionals" on public.user_devotional_cache;
create policy "Readers can remove their own devotionals"
  on public.user_devotional_cache for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.user_devotional_cache is
  'Personalised devotionals, readable only by the reader they were written for.';

-- ---------------------------------------------------------------------------
-- ai_identity()
--
-- Who the database thinks the caller is. An Edge Function cannot decide this
-- for itself: it would be reading an unverified token. Here the JWT has
-- already been checked against the project secret, so a forged id cannot get
-- past it.
-- ---------------------------------------------------------------------------
create or replace function public.ai_identity()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid();
$$;

grant execute on function public.ai_identity() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- consume_ai_quota()
--
-- Takes one generation from the caller''s allowance for today and says whether
-- they were entitled to it. Identity is auth.uid(), so a caller cannot claim
-- somebody else''s allowance, and a guest key is expected pre-hashed.
--
-- The counting is a single INSERT .. ON CONFLICT DO UPDATE .. WHERE, so two
-- simultaneous requests cannot both read room that only one of them has: the
-- second one''s update finds the row already at the limit and changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota(
  p_endpoint text,
  p_guest_key text,
  p_guest_limit integer,
  p_user_limit integer
)
returns table (allowed boolean, used integer, quota integer, signed_in boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket text;
  v_limit integer;
  v_used integer;
begin
  if p_endpoint is null or p_endpoint = '' then
    raise exception 'an endpoint is required';
  end if;

  if v_uid is not null then
    v_bucket := 'user:' || v_uid::text;
    v_limit := coalesce(p_user_limit, 0);
  else
    v_bucket := 'guest:' || coalesce(nullif(p_guest_key, ''), 'unknown');
    v_limit := coalesce(p_guest_limit, 0);
  end if;

  -- A limit of zero means the feature is off for this caller. Handled here
  -- because the first INSERT below has no conflict to apply the WHERE to.
  if v_limit <= 0 then
    return query select false, 0, 0, v_uid is not null;
    return;
  end if;

  insert into public.ai_usage as u (bucket, endpoint, usage_date, used)
  values (v_bucket, p_endpoint, current_date, 1)
  on conflict (bucket, endpoint, usage_date) do update
    set used = u.used + 1, updated_at = pg_catalog.now()
    where u.used < v_limit
  returning u.used into v_used;

  if v_used is not null then
    return query select true, v_used, v_limit, v_uid is not null;
    return;
  end if;

  -- Nothing came back, so the row was already at its limit for today.
  select u.used into v_used
    from public.ai_usage u
   where u.bucket = v_bucket
     and u.endpoint = p_endpoint
     and u.usage_date = current_date;

  return query select false, coalesce(v_used, v_limit), v_limit, v_uid is not null;
end;
$$;

grant execute on function public.consume_ai_quota(text, text, integer, integer) to anon, authenticated;

comment on function public.consume_ai_quota(text, text, integer, integer) is
  'Atomically takes one Gemini generation from today''s allowance for the caller.';
