-- ============================================================================
-- Daily schedule for Bible Verses Understood.
--
-- Run once in the SQL editor, after replacing PROJECT_REF and YOUR_CRON_SECRET.
-- Not a migration: it carries a secret, and secrets do not belong in the repo.
--
-- Scheduling a job under a name that already exists replaces it, so this file
-- is safe to re-run when you want to change a time.
-- ============================================================================

-- 04:30 UTC — warm the day's explanation and devotional so the first reader of
-- the morning, and the email half an hour later, both get a cache hit.
select cron.schedule(
  'bvu-prewarm',
  '30 4 * * *',
  $$
  select net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/prewarm',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', 'YOUR_CRON_SECRET'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- 05:00 UTC — one send to everybody who asked for it. The devotional is
-- already cached by then, so this generates nothing.
select cron.schedule(
  'bvu-daily-email',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/daily-email',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', 'YOUR_CRON_SECRET'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
