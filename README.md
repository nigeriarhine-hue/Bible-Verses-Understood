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
| `GOOGLE_GENERATIVE_AI_API_KEY` | **Required for every explanation, devotional and follow-up.** |
| `GEMINI_MODEL` | Optional model override. Defaults to `gemini-2.0-flash`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lets Edge Functions write the shared study cache. Optional; without it, caching is read-only. |
| `ESV_API_KEY` | Optional. Unlocks the ESV through the Crossway API. |
| `API_BIBLE_KEY` | Optional. Unlocks whichever translations your API.Bible key is authorised for. |
| `ALLOWED_ORIGINS` | Optional comma-separated list to lock the functions to your domains. |

> A service-role key or a Gemini key with a `VITE_` prefix would be compiled into
> the browser bundle. Never do that.

---

## Setting up Supabase

```bash
npm install -g supabase          # or use npx supabase
supabase link --project-ref <your-project-ref>
supabase db push                 # applies everything in supabase/migrations
```

Then set the server secrets and deploy the functions:

```bash
supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

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

## Analytics

The gtag snippet is installed once in `index.html` with `send_page_view: false`,
and `src/components/layout/Layout.tsx` sends exactly one `page_view` per route
change — no duplicates from a single-page navigation.

Events: `verse_search`, `verse_view`, `related_scripture_click`,
`bible_version_change`, `explanation_mode_change`, `topic_selected`,
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

---

## Scripture sources

Bundled texts are normalised from
[scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases),
which collects public-domain translations. `scripts/build-bible-data.mjs`
verifies the chapter count of all 66 books for every translation as it writes
them, and `src/lib/bible/seed-data.test.ts` checks that every curated reference
the app ships resolves to a real verse.
