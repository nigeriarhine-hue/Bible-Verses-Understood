#!/usr/bin/env bash
#
# Links this repository to a Supabase project, applies the migrations, sets the
# server-side secrets and deploys every Edge Function that exists here.
#
#   ./scripts/deploy-supabase.sh <project-ref>
#
# Run it from your own machine: it needs network access to supabase.co and a
# Supabase login, neither of which a sandboxed CI or agent container has.
#
# It never prints a secret value.

set -euo pipefail

PROJECT_REF="${1:-}"
if [ -z "$PROJECT_REF" ]; then
  echo "Usage: ./scripts/deploy-supabase.sh <project-ref>"
  echo "Find the ref in your Supabase dashboard URL, or in .env.local:"
  echo "  VITE_SUPABASE_URL=https://<project-ref>.supabase.co"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# Prefer an installed CLI; otherwise fall back to npx, which pulls a working
# binary from npm without needing a global install.
if command -v supabase >/dev/null 2>&1; then
  SUPABASE="supabase"
elif command -v npx >/dev/null 2>&1; then
  echo "No supabase on PATH — using npx (it will fetch the CLI on first use)."
  SUPABASE="npx --yes supabase"
else
  echo "The Supabase CLI is not available and npx is missing."
  echo "  macOS:  brew install supabase/tap/supabase"
  echo "  npm:    npm install -g supabase"
  echo "  other:  https://supabase.com/docs/guides/local-development/cli/getting-started"
  exit 1
fi

# Every command needs an access token. Fail here with the fix rather than
# halfway through a deployment.
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ ! -f "$HOME/.supabase/access-token" ]; then
  echo
  echo "Not logged in to Supabase. Do one of:"
  echo "  $SUPABASE login"
  echo "  export SUPABASE_ACCESS_TOKEN=...   (from https://supabase.com/dashboard/account/tokens)"
  exit 1
fi

step "Reviewing migrations for anything destructive"
npm run --silent audit:migrations

step "Linking to project $PROJECT_REF"
$SUPABASE link --project-ref "$PROJECT_REF"

step "Applying migrations"
echo "The CLI will show the plan and ask before it changes anything."
$SUPABASE db push

step "Setting Edge Function secrets"
# SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by
# Supabase automatically; the SUPABASE_ prefix is reserved and cannot be set.
if [ -f supabase/functions/.env ]; then
  echo "Using supabase/functions/.env"
  $SUPABASE secrets set --env-file supabase/functions/.env
else
  echo "No supabase/functions/.env found."
  echo "Set the Gemini key now (input is hidden, and nothing is echoed):"
  read -r -s -p "  GOOGLE_GENERATIVE_AI_API_KEY: " GEMINI_KEY; echo
  if [ -n "$GEMINI_KEY" ]; then
    $SUPABASE secrets set "GOOGLE_GENERATIVE_AI_API_KEY=$GEMINI_KEY"
    unset GEMINI_KEY
  else
    echo "  Skipped — explanations will stay switched off until this is set."
  fi
fi

step "Confirming which secret NAMES are configured (values are never shown)"
$SUPABASE secrets list

step "Deploying Edge Functions"
for dir in supabase/functions/*/; do
  name="$(basename "$dir")"
  [ "$name" = "_shared" ] && continue
  [ -f "$dir/index.ts" ] || continue
  echo "  deploying $name"
  $SUPABASE functions deploy "$name"
done

step "Checking the result"
npm run --silent supabase:check || true

cat <<'NOTE'

Two things the CLI cannot set — do them in the Supabase dashboard:

  Authentication -> URL Configuration
    Site URL:
      https://bible-verses-understood.vercel.app
    Redirect URLs (add all of these):
      https://bible-verses-understood.vercel.app/**
      http://localhost:5173/**
      http://localhost:4173/**

  Without those, email confirmation and password-reset links will bounce to
  localhost or be refused.

And in Vercel -> Settings -> Environment Variables (Production):
    VITE_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY
    VITE_SITE_URL = https://bible-verses-understood.vercel.app

  Never put GOOGLE_GENERATIVE_AI_API_KEY, ESV_API_KEY, API_BIBLE_KEY or the
  service-role key into Vercel: anything Vite can see reaches the browser.

Optionally lock the Edge Functions to your own origins:
    supabase secrets set ALLOWED_ORIGINS="https://bible-verses-understood.vercel.app"
  Local development origins are always permitted, and leaving this unset keeps
  the functions open, which is fine for a public Scripture reader.

NOTE

printf 'Done. If supabase:check reported everything green, the backend is live.\n'
