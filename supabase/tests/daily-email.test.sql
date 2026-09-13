-- ============================================================================
-- Daily email: subscriber privacy and send idempotency.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/daily-email.test.sql
--
-- A subscriber list is a list of email addresses. The two things worth proving
-- are that one reader cannot read anybody else's, and that the database — not
-- the sender — is what stops the same person getting the same morning twice.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ada@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'grace@example.test')
on conflict (id) do nothing;

insert into public.daily_email_subscriptions
  (id, user_id, email, email_normalised, is_subscribed, confirmed_at, unsubscribe_token_hash)
values
  ('aaaa1111-1111-4111-8111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'ada@example.test', 'ada@example.test', true, now(), 'digest-a'),
  ('bbbb2222-2222-4222-8222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'grace@example.test', 'grace@example.test', true, now(), 'digest-b'),
  ('cccc3333-3333-4333-8333-333333333333', null,
   'guest@example.test', 'guest@example.test', false, null, 'digest-c');

-- --------------------------------------------------------------------------
-- One address, one row, whatever the capitalisation the caller normalised from.
-- --------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.daily_email_subscriptions (email, email_normalised, unsubscribe_token_hash)
    values ('Ada@Example.Test', 'ada@example.test', 'digest-d');
    raise exception 'the same address was subscribed twice';
  exception
    when unique_violation then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- A reader sees their own subscription and nobody else's.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

do $$
declare v_rows integer; v_email text;
begin
  select count(*), min(email) into v_rows, v_email from public.daily_email_subscriptions;
  if v_rows <> 1 then
    raise exception 'a reader could see % subscription row(s), expected only their own', v_rows;
  end if;
  if v_email <> 'ada@example.test' then
    raise exception 'a reader was shown the address %', v_email;
  end if;
end $$;

-- They cannot change anybody else's, and cannot take one over.
do $$
begin
  update public.daily_email_subscriptions set is_subscribed = false
   where email_normalised = 'grace@example.test';
  if found then raise exception 'a reader unsubscribed somebody else'; end if;

  update public.daily_email_subscriptions
     set user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
   where email_normalised = 'guest@example.test';
  if found then raise exception 'a reader claimed a guest subscription'; end if;
end $$;

-- They can change their own.
do $$
begin
  update public.daily_email_subscriptions set is_subscribed = false
   where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if not found then raise exception 'a reader could not unsubscribe themselves'; end if;
end $$;

-- Deleting is not offered at all, so a row cannot be dropped to dodge the
-- unique constraint or the send log.
do $$
begin
  begin
    delete from public.daily_email_subscriptions where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    if found then raise exception 'a reader deleted their subscription row'; end if;
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- A signed-out visitor is refused the table outright.
-- --------------------------------------------------------------------------
set local role anon;
set local request.jwt.claim.sub = '';

do $$
begin
  begin
    perform count(*) from public.daily_email_subscriptions;
    raise exception 'a signed-out visitor could read the subscriber list';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- --------------------------------------------------------------------------
-- The send log and the run log belong to nobody.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

do $$
begin
  begin
    perform count(*) from public.daily_email_sends;
    raise exception 'a reader could read the send log';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.daily_email_runs;
    raise exception 'a reader could read the run log';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- --------------------------------------------------------------------------
-- The same person cannot be sent the same day twice.
-- --------------------------------------------------------------------------
insert into public.daily_email_sends (send_date, subscription_id, status)
values ('2026-09-13', 'aaaa1111-1111-4111-8111-111111111111', 'sent');

do $$
begin
  begin
    insert into public.daily_email_sends (send_date, subscription_id, status)
    values ('2026-09-13', 'aaaa1111-1111-4111-8111-111111111111', 'sent');
    raise exception 'the same recipient was claimed twice for the same day';
  exception
    when unique_violation then null;
  end;
end $$;

-- A re-run inserts nothing, which is exactly how the sender learns there is
-- nobody left to send to.
do $$
declare v_claimed integer;
begin
  with claimed as (
    insert into public.daily_email_sends (send_date, subscription_id, status)
    values ('2026-09-13', 'aaaa1111-1111-4111-8111-111111111111', 'claimed')
    on conflict (send_date, subscription_id) do nothing
    returning id
  )
  select count(*) into v_claimed from claimed;

  if v_claimed <> 0 then
    raise exception 'a re-run claimed % recipient(s) who had already been sent to', v_claimed;
  end if;
end $$;

-- Tomorrow is a different day, and goes out normally.
do $$
declare v_claimed integer;
begin
  with claimed as (
    insert into public.daily_email_sends (send_date, subscription_id, status)
    values ('2026-09-14', 'aaaa1111-1111-4111-8111-111111111111', 'claimed')
    on conflict (send_date, subscription_id) do nothing
    returning id
  )
  select count(*) into v_claimed from claimed;

  if v_claimed <> 1 then raise exception 'the next day could not be claimed'; end if;
end $$;

-- Only the three statuses the sender uses are accepted.
do $$
begin
  begin
    insert into public.daily_email_sends (send_date, subscription_id, status)
    values ('2026-09-15', 'aaaa1111-1111-4111-8111-111111111111', 'whatever');
    raise exception 'an unknown send status was accepted';
  exception
    when check_violation then null;
  end;
end $$;

rollback;

\echo 'Daily email: all assertions held.'
