# Scheduling

These are **not** migrations. They are run once, by hand, with your own secret
substituted — which is exactly why they are not in `supabase/migrations/`: a
migration containing a secret would be committed, applied by `db push`, and
then live in the repository for ever.

Both scheduled functions authenticate with the same header, `x-cron-secret`,
compared against the `CRON_SECRET` secret. Neither is reachable without it.

## What runs, and when

| Job | Function | Suggested time (UTC) | What it costs |
| --- | --- | --- | --- |
| `bvu-prewarm` | `prewarm` | 04:30 | At most 12 generations, usually 2 |
| `bvu-daily-email` | `daily-email` | 05:00 | Nothing — the prewarm already filled the cache |

The prewarm runs first on purpose. By the time the email goes out, the day's
devotional is already in `study_cache`, so the send generates nothing at all.

One job sends to everybody. There is never a job per subscriber.

## One send time, for now

`daily_email_subscriptions.timezone` is written from the start and read by
nothing. Adding per-timezone delivery later means running the sender hourly and
selecting the subscribers whose local hour matches — no new table, no
migration, no re-asking anybody.

## Setting it up

In the Supabase SQL editor, once:

```sql
-- Both are available on Supabase. pg_net makes the HTTP call; pg_cron schedules it.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
```

Then paste `cron.sql`, replacing the three placeholders first:

- `PROJECT_REF` — e.g. `saoniophzzsjyahsgmkq`
- `YOUR_CRON_SECRET` — the same value you set as the `CRON_SECRET` secret
- the times, if you want different ones

To change a time later, re-run the same `cron.schedule` call with the new
expression: scheduling a job by a name that already exists replaces it.

To check on them:

```sql
select jobname, schedule, active from cron.job;
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;
```

To stop one: `select cron.unschedule('bvu-daily-email');`
