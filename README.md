# Bible Verses Understood

**Understand the Word. Apply it to your life.**

Search any Bible verse, passage, topic, or something you are actually facing, and
read it alongside a clear explanation — with every related passage one click away.

Reading and studying Scripture works with no account and no sign-up. Accounts are
optional, and only add saving, collections and cross-device history.

---

## The one rule this project is built around

**Scripture and commentary are different things, and the interface never blurs
them.**

- Bible text is retrieved from a Bible source and rendered exactly as it reads,
  on its own light serif card, with the translation named. It is never
  generated, paraphrased, or rewritten.
- Everything else — explanations, reflections, suggested passages — is
  commentary written by a language model *about* that retrieved text, on a
  clearly different surface.
- Every reference the model produces is looked up in the Bible before it is
  shown. A citation that does not resolve to a real chapter and verse is
  dropped, not linked.

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + React Router |
| Database, auth, RLS | Supabase (PostgreSQL) |
| Commentary | Google Generative Language (Gemini), called only from Supabase Edge Functions |
| Scripture | Bundled public-domain texts, plus optional licensed providers via an Edge Function proxy |
| Analytics | Google Analytics 4 (`G-YT6WK8YMX9`) |

---

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

That is enough to read and browse all 66 books in four translations. Explanations
need the Supabase pieces below.

```bash
npm run verify         # lint + typecheck + tests + contrast audit + build
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in what you have. Real `.env` files are
git-ignored.

### Client (safe in the browser — Vite only exposes `VITE_`-prefixed variables)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. Without it, accounts and saving are hidden and everything else still works. |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key. Public by design; Row Level Security is what protects data. |
| `VITE_FUNCTIONS_URL` | Optional. Defaults to `${VITE_SUPABASE_URL}/functions/v1`. Point it at `http://127.0.0.1:54321/functions/v1` when serving functions locally. |
| `VITE_GA_MEASUREMENT_ID` | Optional. Defaults to `G-YT6WK8YMX9`, which is also hard-coded in `index.html`. |

### Server only — set as Supabase Edge Function secrets, never with a `VITE_` prefix

| Variable | Purpose |
| --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | **Required for every explanation, devotional and life-situation answer.** |
| `GEMINI_MODEL` | Optional model override. Defaults to `gemini-3.6-flash`. |
| `GEMINI_FALLBACK_MODEL` | Optional. Tried once, and only when the primary model answers HTTP 503 / `UNAVAILABLE`. Confirm the name first with `npm run gemini:models -- --check <model>`. |
| `GEMINI_MAX_OUTPUT_TOKENS` | Optional ceiling on output tokens per request. Defaults to `65536`, what `gemini-3.6-flash` accepts. Set it only for a model that accepts less. |
| `GEMINI_THINKING_LEVEL` | Optional, `low` or `high`. Unset, the model scales its own reasoning to the question. |
| `GEMINI_LOG_USAGE` | Optional. Set to anything to log model, limit, finish reason and token counts once per request. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lets Edge Functions write the shared study cache. **Supabase injects this automatically** — you do not set it, and the `SUPABASE_` prefix is reserved so `supabase secrets set` would reject it. |
| `ESV_API_KEY` | Optional. Unlocks the ESV through the Crossway API. |
| `API_BIBLE_KEY` | Optional. Unlocks whichever translations your API.Bible key is authorised for. |
| `ALLOWED_ORIGINS` | Optional comma-separated list to lock the functions to your domains. |
| `RESEND_API_KEY` | **Required for the daily email.** Never exposed to the browser. |
| `EMAIL_FROM` | The verified sender on your Resend domain. |
| `EMAIL_TOKEN_SECRET` | Signs unsubscribe links. Changing it invalidates links already in inboxes. |
| `CRON_SECRET` | Shared by `prewarm` and `daily-email`; without it neither can be triggered. |
| `SITE_URL` | The public site. Used for email links and to read the bundled Scripture. |
| `EMAIL_TRANSLATION` | Optional. Public-domain translations only; anything else is refused. |
| `PREWARM_REFERENCES` / `PREWARM_TRANSLATIONS` | Optional short lists to warm each morning. |

> A service-role key or a Gemini key with a `VITE_` prefix would be compiled into
> the browser bundle. Never do that.

#### The daily verse email

Opt-in only. Making an account does not subscribe anybody, and typing somebody
else's address does not either: a guest's address gets one confirmation email
and nothing more until the link in it is clicked. A signed-in reader's address
is already verified by Supabase Auth, so theirs takes effect at once and is
managed from their profile.

**One devotional, everybody.** `daily-email` reads the day's general devotional
from `study_cache` — `prewarm` has usually filled it half an hour earlier — and
only generates if it is empty, once, before the first email goes out. Gemini is
called at most once a day however many subscribers there are, and a personalised
devotional is never used: it is written about one reader and belongs to them.

**Sent once.** Every recipient is claimed by inserting into `daily_email_sends`,
whose unique key is `(send_date, subscription_id)`. A second run of the same day
claims nobody and therefore sends nobody anything. That is the database's
guarantee, not a check in the function.

**Scripture in email is public domain** — KJV by default. A licence to display a
translation on a website is not a licence to redistribute it by email, so
`EMAIL_TRANSLATION` accepts only the four bundled public-domain translations and
refuses anything else. The site still shows whatever translation a reader has
chosen.

**Unsubscribing** needs no account: every email carries a link whose token is an
HMAC of the subscription, so the sender can rebuild it without storing anything
usable. A `List-Unsubscribe` header is sent too, so a mail client can offer it
directly. An address the provider rejects is suppressed rather than retried
every morning for ever.

Scheduling lives in [`supabase/scheduling/`](supabase/scheduling/) — run once,
by hand, because it carries a secret. One job sends to everybody; there is never
a job per subscriber. `daily_email_subscriptions.timezone` is written from the
start and read by nothing, so per-timezone delivery can be added later by
running the sender hourly rather than by rebuilding anything.

#### What calls Gemini, and how often

Three endpoints generate: `study`, `devotional` and `situation`. `scripture`
never has, and `followup` no longer does — it answers 410 and imports no
Gemini client at all, so an old browser gets a sentence rather than a bill.

| Endpoint | Guest / day | Reader / day | Thinking | Tier | Length | Cached |
| --- | --- | --- | --- | --- | --- | --- |
| `study` (Simple) | 20 | 50 | low | standard | ≤ 300 words | shared |
| `devotional` (general) | 5 | 15 | low | standard | 350-450 words | shared |
| `devotional` (personalised) | — | 15 | low | standard | 350-450 words | private |
| `situation` | 2 | 5 | low | standard | ≤ 500 words | never |

Two more generate, and neither is reachable by the public: `prewarm` warms the
day's verse ahead of the first reader (capped at 12 generations a run), and
`daily-email` generates the day's devotional only if `prewarm` did not. Both
require `CRON_SECRET`. `followup` and `email-subscription` import no Gemini
client at all.

`study` writes the Simple Explanation and nothing else. A request for `deep` or
`scholar` is refused with 400 before the cache is even read, because hiding a
control in the UI does not stop a direct POST.

**Caching.** `study` and the general `devotional` read
[`study_cache`](supabase/migrations/20260907120100_reference_content.sql) before
they generate and write to it afterwards, keyed on reference, translation, mode,
prompt version and a digest of the Scripture text. The same passage is written
once and served to everyone. A **personalised** devotional goes to
`user_devotional_cache` instead, read and written through the reader's own
token so row-level security is what keeps it private — not the correctness of
the key. Its identity includes the reader's id and the set of interests they
chose, so changing those interests produces a different devotional rather than
an old one. A guest asking for a personalised devotional gets the general one:
there is nowhere private to keep theirs. Life-situation guidance is never
cached anywhere, which is why it has the tightest allowance.

**Allowances.** Every generation is counted in Postgres by
`consume_ai_quota`, which decides who the caller is from the verified JWT
rather than from anything the request claims. The counting is a single
`insert .. on conflict .. where`, so two requests arriving together cannot both
take the last one, and the count is the same on every instance and across cold
starts. The in-memory limiter that remains is burst protection only. A cache
hit is never charged — the allowance is on new AI content, not on reading.

When an allowance runs out the endpoint answers 429 with
`code: daily_limit_reached`, and the reader is told that Bible reading and
previously prepared explanations remain available — which is true: Scripture
never touches Gemini, and both caches are read before the allowance is.

Every limit can be moved with a secret, e.g. `AI_DAILY_LIMIT_SITUATION_USER=10`.

`thinkingLevel: 'low'` is asked for per request on all three: these are short
pieces about text supplied in full, and reasoning is billed and spent from the
same output budget as the answer.

#### Output token budgets

Reasoning tokens are spent from the same budget as the answer, so a request
capped at 4,096 could spend half of it thinking and then stop mid-sentence.
[`supabase/functions/_shared/tokens.ts`](supabase/functions/_shared/tokens.ts)
is the only place that decides these limits. Functions ask for a named budget,
never a number:

| Budget | Tokens | Used by |
| --- | --- | --- |
| `standard` | 16,384 | Simple Explanation, devotional |
| `long` | 32,768 | Life-situation guidance |
| `maximum` | ceiling (65,536) | Nothing at present; the ceiling everything clamps to |

A budget is a ceiling, not a target — the prompts ask for 300 words or fewer for
the Simple Explanation and 350-450 for a devotional. If an answer is
cut off anyway, the request is retried once at the ceiling and once only; a
request that was already at the ceiling reports the truncation rather than
returning half an answer. And if the API rejects the limit as too high, it
names its own maximum, which is adopted and remembered.

#### When a model is overloaded

A popular Gemini model answers HTTP 503 `UNAVAILABLE` under load. Set
`GEMINI_FALLBACK_MODEL` and that one failure is retried once on the second
model, with the same request; everything else — a rejected key, a refused
permission, a malformed request, a model that no longer exists — is reported
straight back, because it would fail the same way on any model. If both are
busy the reader gets a plain "try again in a moment" and a working retry
button.

Choose a fallback that is lighter or older than your primary, so it is not
waiting on the same capacity, and confirm the name against your own key before
setting it — model availability differs by key and by API version:

```bash
npm run gemini:models -- --key <your-gemini-key>
npm run gemini:models -- --key <your-gemini-key> --check gemini-3.5-flash-lite
```

---

## Setting up Supabase

```bash
npm install -g supabase          # or use npx supabase
supabase link --project-ref <your-project-ref>
supabase db push                 # applies everything in supabase/migrations
```

Then set the server secrets and deploy the functions:

```bash
# SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
# into Edge Functions automatically; only your own keys need setting.
supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=...
supabase secrets set ESV_API_KEY=...        # optional
supabase secrets set API_BIBLE_KEY=...      # optional

supabase functions deploy study
supabase functions deploy followup
supabase functions deploy devotional
supabase functions deploy situation
supabase functions deploy scripture
```

Locally:

```bash
supabase start
supabase functions serve   # then set VITE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1
```

### Checking the connection

Once `.env.local` has your URL and anon key:

```bash
npm run supabase:check
```

It uses only the public anon key and reports whether the project is reachable,
whether the migrations have been applied, whether the seed data is present,
whether Row Level Security is genuinely refusing anonymous reads of private
tables, and which Edge Functions are deployed. It refuses to report anything it
could not verify — if it cannot reach the project it stops rather than reading a
network error as a passing check.

### Auth

Email/password sign-up, sign-in, sign-out and password reset work out of the box.
Google sign-in is wired up in the app and disabled in `supabase/config.toml`; set
`SUPABASE_AUTH_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_GOOGLE_SECRET` and flip
`[auth.external.google] enabled = true` to turn it on.

Add your deployed origin to `site_url` and `additional_redirect_urls`, and allow
`/auth/callback` and `/auth/reset` as redirect targets.

### Database types

`src/types/database.ts` mirrors the migrations by hand. With the Supabase CLI
running locally you can regenerate it instead:

```bash
npm run db:types
```

---

## Bible translations

### Available now — bundled, public domain

| | | |
| --- | --- | --- |
| **KJV** | King James Version (1769) | Public domain |
| **BSB** | Berean Standard Bible | Dedicated to the public domain |
| **ASV** | American Standard Version (1901) | Public domain |
| **YLT** | Young's Literal Translation (1898) | Public domain |

All four ship as per-book JSON under `public/scripture/`, 31,102 verses each,
fetched a book at a time and cached. No API key, no network dependency, no rate
limit. Regenerate them with:

```bash
npm run bible:build
```

### Prepared, awaiting authorised access

ESV, NIV, NKJV, NLT, NASB, CSB, AMP, RSV, NRSV, NRSVue, NET, WEB, GNT, CEV,
HCSB, LEB, MEV and Douay-Rheims are in the catalogue and the database with
`is_available = false`. The interface lists them as awaiting licensed access
rather than pretending they work.

They become selectable automatically when a provider key is configured **and**
that provider reports it can serve them:

- `ESV_API_KEY` → ESV, via `api.esv.org`.
- `API_BIBLE_KEY` → whichever English Bibles your API.Bible agreement covers.

The `scripture` Edge Function asks the provider what it is actually authorised
for and returns only that. Nothing is marked available on trust.

> NIV, NKJV, NLT and MEV are not offered through either provider integration.
> Serving them needs a direct licence from their publishers.

---

## Deployment

The app is a static single-page build. `vercel.json` sets the SPA rewrite that
makes deep links work — without it, `/verse/romans/8/28`, `/saved` and both auth
callback routes return 404 on any static host, which breaks email confirmation
and password reset. It also sets long-lived caching for hashed assets and the
Scripture data, and a small set of security headers.

Set these in Vercel for the Production environment:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_SITE_URL` | the public origin, e.g. `https://your-app.vercel.app` |

Nothing else belongs in Vercel. `GOOGLE_GENERATIVE_AI_API_KEY`, `ESV_API_KEY`,
`API_BIBLE_KEY` and the service-role key are Supabase Edge Function secrets —
anything Vite can read is compiled into the browser bundle.

In Supabase, under **Authentication → URL Configuration**, set the Site URL to
your production origin and add `https://your-app.vercel.app/**` plus
`http://localhost:5173/**` as redirect URLs.

### Moving to a custom domain

No domain is named anywhere in the source. Changing where the app lives means
updating, in order: the Vercel domain, `VITE_SITE_URL`, the Supabase Site URL
and redirect list, and `ALLOWED_ORIGINS` if you have set it. Auth redirects use
the origin the reader is actually on, so they need no change at all.

## Analytics

The gtag snippet is installed once in `index.html` with `send_page_view: false`,
and `src/components/layout/Layout.tsx` sends exactly one `page_view` per route
change — no duplicates from a single-page navigation.

Events: `verse_search`, `verse_view`, `related_scripture_click`,
`bible_version_change`, `topic_selected`,
`devotional_view`, `verse_saved`, `verse_shared`, `audio_play`,
`account_signup`, `collection_created`.

**Nothing a reader types about their own life, and no conversation content, is
ever sent.** Parameters carry references, translations and modes only, and are
truncated. `src/lib/analytics.test.ts` pins this down.

---

## Readability

The background is a sky that changes with the time of day, so contrast cannot be
assumed — it is checked.

```bash
npm run audit:contrast      # static: every ink/surface pair over every sky
npm run audit:readability   # live browser, needs `npm run preview` running
```

- **Contrast audit** composites each glass surface over each sky colour and
  measures the real ratio. 193 combinations, all above WCAG AA, lowest 5.5:1.
- **Readability audit** drives Chromium across 14 routes and 4 interaction states
  at 320 / 375 / 390 / 430 / 768 / 1280px, and fails on any text without a
  surface behind it, any type under 14px, and any horizontal overflow.

Two surfaces carry all text: `.glass` (deep translucent navy, light ink) and
`.glass-light` (luminous near-white, dark ink, used for Scripture). Nothing is
ever set directly on the sky.

---

## Project layout

```
public/scripture/<CODE>/<book>.json   Bundled public-domain Scripture
scripts/                              Dataset builder and the two audits
src/lib/bible/                        Reference parsing, validation, provider
src/lib/ai/                           Commentary client and types
src/lib/library.ts                    Saved verses, studies, collections, history
src/context/                          Auth, preferences, study trail, toasts
src/components/                       Layout, scripture, study, UI primitives
src/pages/                            Routes
supabase/migrations/                  Schema, RLS, seeds
supabase/functions/                   Edge Functions (the only place keys live)
supabase/tests/rls.test.sql           Row Level Security checks
```

---

## Database and privacy

Row Level Security is enabled on every table. Readers can only reach their own
profile, preferences, saved verses, saved studies, collections, history,
navigation, devotionals and conversations. Public reference tables (translations,
topics, topic verses, daily verses, the study cache) are readable by anyone and
writable only by the service role.

To check the policies against a real PostgreSQL server:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
```

It creates two readers, proves neither can see, change, or delete the other's
data, proves an anonymous visitor can read reference content but write nothing,
and fails if RLS is off anywhere.

A second suite walks the whole signed-in journey against real policies — profile
and preferences created on sign-up, translation preference persisting, saving a
verse, collections, study history across all six sources, and the Related
Scripture trail — then proves a second reader can see none of it:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/user-journey.test.sql
```

Signed out, a reader's translation, history and study trail live in their own
browser and are never sent anywhere. Life-situation text and follow-up questions
are used to answer that one request and are not stored.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest |
| `npm run verify` | Lint, typecheck, tests, contrast audit, build |
| `npm run audit:contrast` | Static contrast audit |
| `npm run audit:readability` | Live browser readability and layout audit |
| `npm run bible:build` | Rebuild the bundled Scripture data |
| `npm run db:types` | Regenerate database types from a local Supabase |
| `npm run supabase:check` | Check a configured project: reachability, migrations, seeds, RLS, functions |
| `npm run supabase:deploy` | Link, apply migrations, set secrets and deploy all five Edge Functions |
| `npm run audit:migrations` | Report anything in the migrations that could destroy existing data |

---

## Scripture sources

Bundled texts are normalised from
[scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases),
which collects public-domain translations. `scripts/build-bible-data.mjs`
verifies the chapter count of all 66 books for every translation as it writes
them, and `src/lib/bible/seed-data.test.ts` checks that every curated reference
the app ships resolves to a real verse.
