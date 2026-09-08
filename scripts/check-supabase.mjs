#!/usr/bin/env node
/**
 * Checks a configured Supabase project end to end, from the outside, using only
 * the public anon key.
 *
 *   npm run supabase:check
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local, then .env.
 * Reports whether the project is reachable, whether the migrations have been
 * applied, whether the seed data is present, and whether Row Level Security is
 * actually refusing anonymous access to private tables.
 *
 * Never prints the key.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match && match[2].trim()) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/**
 * Asks the CLI for the project's anon key. Only reached when a ref is known but
 * no key is configured — which is the normal state of a fresh clone, since
 * .env.local is deliberately not in the repository.
 */
function anonKeyFromCli(ref) {
  for (const command of [
    ['supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json']],
    ['npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json']],
  ]) {
    try {
      const out = execFileSync(command[0], command[1], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const keys = JSON.parse(out);
      const anon = keys.find?.((k) => k.name === 'anon');
      if (anon?.api_key) return anon.api_key;
    } catch {
      // Try the next way in, then give up quietly.
    }
  }
  return '';
}

const env = loadEnv();
const ref = argValue('ref');

let url = (argValue('url') ?? process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
if (!url && ref) url = `https://${ref}.supabase.co`;

let key = argValue('key') ?? process.env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
if (!key && ref) {
  console.log('No anon key configured locally — asking the Supabase CLI for it...\n');
  key = anonKeyFromCli(ref);
}

if (!url || !key) {
  console.error('Could not work out which project to check.');
  console.error('');
  console.error('Give it a project ref:');
  console.error('  npm run supabase:check -- --ref <project-ref>');
  console.error('');
  console.error('Or put the values in .env.local (copy .env.example first):');
  console.error('  VITE_SUPABASE_URL=');
  console.error('  VITE_SUPABASE_ANON_KEY=');
  if (ref && !key) {
    console.error('');
    console.error(`A ref was given but the CLI could not supply an anon key for "${ref}".`);
    console.error('Run `supabase login` first, or pass the key with --key.');
  }
  process.exit(1);
}

let role = 'unknown';
try {
  role = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).role;
} catch {
  /* not a JWT we can read */
}

console.log(`Project: ${url}`);
console.log(`Key role: ${role}${role === 'service_role' ? '  ← WRONG: never use the service-role key here' : ''}\n`);
if (role === 'service_role') process.exit(1);

const headers = { apikey: key, Authorization: `Bearer ${key}` };
let failures = 0;

const check = async (label, run) => {
  try {
    const { ok, detail } = await run();
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  } catch (error) {
    console.log(`  FAIL  ${label} — ${error instanceof Error ? error.message : error}`);
    failures += 1;
  }
};

const rest = (query) => fetch(`${url}/rest/v1/${query}`, { headers });

console.log('Connection');

// Nothing below this point is meaningful unless we actually reached Supabase.
// A proxy, a firewall or an offline machine can answer every request with an
// error, and reading those as "refused by RLS" or "not deployed" would be a
// confident lie. So prove we are talking to Supabase before going further.
let health;
try {
  health = await fetch(`${url}/auth/v1/health`, { headers });
} catch (error) {
  console.log(`  FAIL  project is reachable — ${error instanceof Error ? error.message : error}`);
  console.log('\nCould not reach the project, so no further checks were run.');
  console.log('Check the URL, your network, and any proxy or firewall in the way.');
  process.exit(1);
}

const healthBody = await health.text().catch(() => '');
const looksLikeSupabase = health.ok && /GoTrue|"version"|"date"/i.test(healthBody);
if (!looksLikeSupabase) {
  console.log(`  FAIL  project is reachable — HTTP ${health.status} from ${url}/auth/v1/health`);
  if (health.status === 403 || health.status === 407) {
    console.log('        A 403/407 here usually comes from a proxy rather than Supabase.');
  }
  console.log('\nCould not confirm this is a live Supabase project, so no further');
  console.log('checks were run — their results would not be trustworthy.');
  process.exit(1);
}
console.log(`  PASS  project is reachable — HTTP ${health.status}`);

await check('anon key is accepted', async () => {
  const res = await rest('topics?select=slug&limit=1');
  if (res.status === 401) return { ok: false, detail: 'HTTP 401 — the key was rejected' };
  return { ok: true, detail: `HTTP ${res.status}` };
});

console.log('\nMigrations');
const tables = [
  'profiles', 'user_preferences', 'bible_translations', 'saved_verses', 'saved_studies',
  'collections', 'collection_verses', 'study_history', 'study_navigation', 'topics',
  'topic_verses', 'daily_verses', 'devotionals', 'conversations', 'conversation_messages',
  'share_cards', 'study_cache',
];
const missing = [];
const unknown = [];
for (const table of tables) {
  const res = await rest(`${table}?select=*&limit=0`);
  const body = await res.text().catch(() => '');
  if (res.status === 404 || body.includes('PGRST205')) {
    missing.push(table);
  } else if (!res.ok && res.status !== 401 && res.status !== 403) {
    // Present-but-restricted answers with 401/403; anything else is a surprise.
    unknown.push(`${table} (HTTP ${res.status})`);
  }
}
await check(`all ${tables.length} tables exist`, async () => ({
  ok: missing.length === 0 && unknown.length === 0,
  detail: missing.length
    ? `missing: ${missing.join(', ')} — run the migrations`
    : unknown.length
      ? `unexpected response for: ${unknown.join(', ')}`
      : 'schema applied',
}));

console.log('\nSeed data');
await check('topics seeded', async () => {
  const res = await rest('topics?select=slug');
  const rows = res.ok ? await res.json() : [];
  return { ok: rows.length >= 50, detail: `${rows.length} topics` };
});
await check('topic verses seeded', async () => {
  const res = await rest('topic_verses?select=id');
  const rows = res.ok ? await res.json() : [];
  return { ok: rows.length >= 300, detail: `${rows.length} verses` };
});
await check('translations seeded', async () => {
  const res = await rest('bible_translations?select=abbreviation,is_available');
  const rows = res.ok ? await res.json() : [];
  const available = rows.filter((r) => r.is_available).map((r) => r.abbreviation);
  return { ok: rows.length >= 20, detail: `${rows.length} listed, available: ${available.join(', ') || 'none'}` };
});
await check('daily verses seeded', async () => {
  const res = await rest('daily_verses?select=verse_date&limit=1000');
  const rows = res.ok ? await res.json() : [];
  return { ok: rows.length > 300, detail: `${rows.length} dates` };
});

console.log('\nRow Level Security (anonymous must see no private data)');
// A table that does not exist refuses everything, which proves nothing about
// RLS. Only judge policies once the schema is actually there.
const privateTables = ['saved_verses', 'saved_studies', 'collections', 'study_history', 'conversations', 'profiles']
  .filter((table) => !missing.includes(table));
if (privateTables.length === 0) {
  console.log('  SKIP  no private tables exist yet — run the migrations, then re-check');
  failures += 1;
}
for (const table of privateTables) {
  await check(`${table} is closed to anonymous reads`, async () => {
    const res = await rest(`${table}?select=id&limit=5`);
    const body = await res.text().catch(() => '');
    if (res.ok) {
      const rows = JSON.parse(body || '[]');
      return {
        ok: rows.length === 0,
        detail: rows.length === 0 ? 'no rows returned' : `LEAKED ${rows.length} rows`,
      };
    }
    // Only trust a refusal that PostgREST itself issued.
    const fromPostgrest = /PGRST|"code"|"hint"|permission denied/i.test(body);
    return {
      ok: fromPostgrest,
      detail: fromPostgrest ? `refused by PostgREST (HTTP ${res.status})` : `unclear answer (HTTP ${res.status})`,
    };
  });
}
if (!missing.includes('topics')) await check('anonymous cannot write reference data', async () => {
  const res = await fetch(`${url}/rest/v1/topics`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: `probe-${Date.now()}`, name: 'Probe' }),
  });
  return { ok: !res.ok, detail: res.ok ? 'INSERT SUCCEEDED — RLS is not protecting this table' : `refused with HTTP ${res.status}` };
});

console.log('\nEdge Functions');
for (const fn of ['study', 'devotional', 'situation', 'followup', 'scripture']) {
  await check(`${fn} is deployed`, async () => {
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // 404 means not deployed. Anything else means it is there and answered.
    const body = await res.text().catch(() => '');
    if (res.status === 404) return { ok: false, detail: 'not deployed' };
    // Our functions always answer with JSON carrying an "error" or a payload.
    // Anything else is an edge-runtime or proxy response, not our code.
    const ourFunction = /"error"|"translations"|commentary_not_configured|Bible reference/i.test(body);
    if (!ourFunction) {
      return { ok: false, detail: `unclear answer (HTTP ${res.status}) — may not be deployed` };
    }
    return {
      ok: true,
      detail: body.includes('commentary_not_configured')
        ? 'deployed, but GOOGLE_GENERATIVE_AI_API_KEY is not set'
        : `deployed (HTTP ${res.status})`,
    };
  });
}

console.log(failures === 0 ? '\nEverything checks out.' : `\n${failures} check(s) failed — see above.`);
process.exit(failures === 0 ? 0 : 1);
