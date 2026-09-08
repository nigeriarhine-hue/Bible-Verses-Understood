#!/usr/bin/env node
/**
 * Runs a real study through the deployed Edge Functions and reports what came
 * back — or the exact error if it did not.
 *
 *   npm run gemini:test -- --ref <project-ref>
 *   npm run gemini:test -- --ref <project-ref> --reference "Romans 8:28"
 *
 * This makes genuine Gemini calls and costs real quota. It exists because
 * nothing else proves the commentary pipeline works end to end: a deployed
 * function answers the same way whether or not its API key is set, until you
 * send it a request it can actually act on.
 *
 * It never prints a key.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

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

function anonKeyFromCli(ref) {
  for (const [bin, args] of [
    ['supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json']],
    ['npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json']],
  ]) {
    try {
      const keys = JSON.parse(execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      const anon = keys.find?.((k) => k.name === 'anon');
      if (anon?.api_key) return anon.api_key;
    } catch { /* try the next */ }
  }
  return '';
}

const env = loadEnv();
const ref = argValue('ref');
let url = (argValue('url') ?? process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
if (!url && ref) url = `https://${ref}.supabase.co`;
let key = argValue('key') ?? process.env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
if (!key && ref) key = anonKeyFromCli(ref);

if (!url || !key) {
  console.error('Could not work out which project to test.');
  console.error('  npm run gemini:test -- --ref <project-ref>');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Scripture comes from the bundled text, exactly as the app supplies it.      */
/* -------------------------------------------------------------------------- */

const BOOKS = JSON.parse(readFileSync(path.join(ROOT, 'public/scripture/KJV/index.json'), 'utf8'));

function loadVerse(reference) {
  const match = /^([\w\s]+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(reference.trim());
  if (!match) throw new Error(`Could not parse "${reference}"`);
  const [, bookName, chapter, start, end] = match;
  const slug = bookName.trim().toLowerCase().replace(/\s+/g, '-');
  const file = path.join(ROOT, `public/scripture/KJV/${slug}.json`);
  if (!existsSync(file)) throw new Error(`No bundled text for "${bookName}"`);
  const book = JSON.parse(readFileSync(file, 'utf8'));
  const verses = book.chapters[Number(chapter) - 1] ?? [];
  const from = Number(start);
  const to = end ? Number(end) : from;
  const text = verses.slice(from - 1, to).join(' ');
  if (!text) throw new Error(`No text for ${reference}`);
  return text;
}

/** Confirms a reference the model produced actually exists in Scripture. */
function referenceExists(reference) {
  const match = /^([\w\s]+?)\s+(\d+)(?::(\d+))?/.exec(reference.trim());
  if (!match) return false;
  const slug = match[1].trim().toLowerCase().replace(/\s+/g, '-');
  const entry = BOOKS.books.find((b) => b.id === slug);
  if (!entry) return false;
  const verseCount = entry.verses[Number(match[2]) - 1];
  if (!verseCount) return false;
  return !match[3] || Number(match[3]) <= verseCount;
}

async function callFunction(name, body) {
  const started = Date.now();
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, body: parsed, raw, ms: Date.now() - started };
}

/* -------------------------------------------------------------------------- */

const reference = argValue('reference') ?? 'John 3:16';
const translation = 'KJV';
const scriptureText = loadVerse(reference);

console.log(`Project:   ${url}`);
console.log(`Passage:   ${reference} (${translation})`);
console.log(`Scripture: "${scriptureText.slice(0, 88)}${scriptureText.length > 88 ? '…' : ''}"`);
console.log('           (from the bundled public-domain text, not generated)\n');

let failures = 0;

for (const mode of ['simple', 'deep', 'scholar']) {
  process.stdout.write(`${mode.padEnd(8)} `);
  const result = await callFunction('study', { reference, translation, mode, scriptureText });

  if (!result.ok) {
    failures += 1;
    const error = result.body?.error ?? result.raw.slice(0, 200);
    const code = result.body?.code ? ` [${result.body.code}]` : '';
    console.log(`FAILED  HTTP ${result.status}${code}`);
    console.log(`         ${error}`);
    if (result.body?.code === 'commentary_not_configured') {
      console.log('         Fix: supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=...');
    }
    continue;
  }

  const study = result.body;
  const sections = study.sections ?? [];
  const related = study.relatedScripture ?? [];
  const words = [study.summary ?? '', ...sections.map((s) => s.body)].join(' ').split(/\s+/).length;

  // A cached answer is a previous real answer, not a mock — say which it is.
  const origin = study.cached ? 'from cache' : 'live Gemini call';
  console.log(`OK      ${(result.ms / 1000).toFixed(1)}s, ${origin}`);
  console.log(`         sections: ${sections.map((s) => s.heading).join(' | ').slice(0, 96)}`);
  console.log(`         ${words} words, ${related.length} related passages`);

  if (study.summary) {
    console.log(`         summary: "${study.summary.replace(/\s+/g, ' ').slice(0, 100)}…"`);
  }

  const bad = related.filter((r) => !referenceExists(r.reference));
  if (bad.length) {
    failures += 1;
    console.log(`         PROBLEM: ${bad.length} related reference(s) do not exist: ${bad.map((r) => r.reference).join(', ')}`);
  } else if (related.length) {
    console.log(`         related: ${related.map((r) => r.reference).join(', ')} — all verified against Scripture`);
  }

  // Guardrails the product promises never to cross.
  const prose = [study.summary ?? '', ...sections.map((s) => s.body)].join(' ');
  const forbidden = [
    [/\bGod told you\b/i, '"God told you"'],
    [/\bGod is saying you will\b/i, '"God is saying you will"'],
    [/\bthis guarantees\b/i, '"this guarantees"'],
    [/\byou will definitely receive\b/i, '"you will definitely receive"'],
  ].filter(([pattern]) => pattern.test(prose));
  if (forbidden.length) {
    failures += 1;
    console.log(`         PROBLEM: crossed a guardrail: ${forbidden.map((f) => f[1]).join(', ')}`);
  }
  console.log('');
}

console.log(
  failures === 0
    ? 'Live Gemini is working: real explanations in all three modes, every related reference verified.'
    : `${failures} problem(s) — see above.`,
);
process.exit(failures === 0 ? 0 : 1);
