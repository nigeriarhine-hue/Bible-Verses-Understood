-- ============================================================================
-- Daily verse and devotional email
--
-- Three tables: who asked for it, what was sent to whom on which day, and how
-- each day's run went. The second is what makes a repeat send impossible
-- rather than merely unlikely — the unique constraint on (send_date,
-- subscription_id) is the idempotency, not a check in application code.
--
-- Nothing here is readable by an anonymous visitor. A signed-in reader can see
-- and change only their own subscription; the send log and the run log are
-- operational and belong to nobody, so no policy grants access to them at all.
--
-- Additive and re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- daily_email_subscriptions
--
-- A row exists from the moment someone asks, but is_subscribed stays false
-- until the address is confirmed. A guest cannot sign somebody else up: the
-- confirmation link is the proof, and nothing is sent to an unconfirmed
-- address except that one email.
--
-- Only digests of the tokens are stored. A leaked table cannot be used to
-- unsubscribe anyone or to confirm an address that was never confirmed.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  -- Lowercased and trimmed, so one address cannot be subscribed twice under
  -- different capitalisation.
  email_normalised text not null,
  is_subscribed boolean not null default false,
  confirmed_at timestamptz,
  confirmation_token_hash text,
  confirmation_sent_at timestamptz,
  unsubscribe_token_hash text not null,
  -- Stored from the start so per-timezone sending can be added later without
  -- asking everybody again. Nothing reads it yet: there is one send time.
  timezone text not null default 'UTC',
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  -- A permanently failing address is suppressed rather than retried for ever.
  failure_count integer not null default 0,
  suppressed_at timestamptz,
  suppression_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_normalised)
);

create index if not exists daily_email_subscriptions_active_idx
  on public.daily_email_subscriptions (is_subscribed, suppressed_at);
create index if not exists daily_email_subscriptions_user_idx
  on public.daily_email_subscriptions (user_id);

alter table public.daily_email_subscriptions enable row level security;

-- A reader manages their own row through the app; everything else — a guest
-- subscribing, confirming, unsubscribing from a link — goes through the Edge
-- Function with the service role, which is the only way a token can be checked
-- without handing the table to anonymous callers.
grant select, update on public.daily_email_subscriptions to authenticated;
revoke all on public.daily_email_subscriptions from anon;

drop policy if exists "Readers can see their own subscription" on public.daily_email_subscriptions;
create policy "Readers can see their own subscription"
  on public.daily_email_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Readers can change their own subscription" on public.daily_email_subscriptions;
create policy "Readers can change their own subscription"
  on public.daily_email_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.daily_email_subscriptions is
  'Opt-in list for the daily verse email. Tokens are stored only as digests.';

-- ---------------------------------------------------------------------------
-- daily_email_sends
--
-- One row per recipient per day, claimed before the email is handed to the
-- provider. The unique constraint is what stops a second run of the same day
-- sending again: a re-run inserts nothing and therefore sends nothing.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_email_sends (
  id uuid primary key default gen_random_uuid(),
  send_date date not null,
  subscription_id uuid not null
    references public.daily_email_subscriptions (id) on delete cascade,
  status text not null default 'claimed',
  -- The provider's id, for tracing a delivery question. No message body, no
  -- Scripture, nothing about the reader beyond which row it went to.
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (send_date, subscription_id),
  constraint daily_email_sends_status_check
    check (status in ('claimed', 'sent', 'failed'))
);

create index if not exists daily_email_sends_date_idx
  on public.daily_email_sends (send_date);

alter table public.daily_email_sends enable row level security;
revoke all on public.daily_email_sends from anon, authenticated;

comment on table public.daily_email_sends is
  'One row per recipient per day. The unique key is the idempotency.';

-- ---------------------------------------------------------------------------
-- daily_email_runs
--
-- What the scheduled job did each day, so a missed or doubled send can be
-- answered from the database rather than from logs that have rolled over.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_email_runs (
  send_date date primary key,
  reference text,
  translation text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  note text
);

alter table public.daily_email_runs enable row level security;
revoke all on public.daily_email_runs from anon, authenticated;

comment on table public.daily_email_runs is
  'One row per day the sender ran. Counts only — no addresses, no content.';

-- ---------------------------------------------------------------------------
-- Keep updated_at honest without a trigger per table.
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.daily_email_subscriptions;
create trigger set_updated_at
  before update on public.daily_email_subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.daily_email_sends;
create trigger set_updated_at
  before update on public.daily_email_sends
  for each row execute function public.set_updated_at();
