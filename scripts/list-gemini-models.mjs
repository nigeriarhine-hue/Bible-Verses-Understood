#!/usr/bin/env node
/**
 * Lists the models your Gemini key can actually call, so a model name is
 * confirmed before it is set as a secret rather than guessed at.
 *
 *   npm run gemini:models
 *   npm run gemini:models -- --key <your-gemini-key>
 *   npm run gemini:models -- --check gemini-3.6-flash --check gemini-3.5-flash-lite
 *
 * A model that is not listed here does not exist for this project, whatever a
 * blog post or a docs page says: availability differs by key, by project and by
 * API version, and `v1beta` on the Generative Language API is what this app
 * calls. With `--check`, the script exits non-zero if any named model is
 * missing or cannot do generateContent.
 *
 * The key is read from the argument, the environment or a local .env file, is
 * sent in a header rather than the URL, and is never printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/** --check may be repeated. */
function argValues(name) {
  const found = [];
  process.argv.forEach((arg, i) => {
    if (arg === `--${name}` && process.argv[i + 1]) found.push(process.argv[i + 1]);
  });
  return found;
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

const env = loadEnv();
const key = argValue('key') ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';

if (!key) {
  console.error('No Gemini key found.\n');
  console.error('The key lives as a Supabase secret, so it is not on this machine by default.');
  console.error('Pass it for this one command instead:\n');
  console.error('  npm run gemini:models -- --key <your-gemini-key>\n');
  console.error('or export it first:\n');
  console.error('  export GOOGLE_GENERATIVE_AI_API_KEY=<your-gemini-key>');
  console.error('  npm run gemini:models\n');
  console.error('Get one at https://aistudio.google.com/apikey — it is never printed by this script.');
  process.exit(1);
}

async function fetchAllModels() {
  const models = [];
  let pageToken = '';
  do {
    const url = `${API_ROOT}/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`The models list request failed with HTTP ${res.status}.`);
      // Google's error body names the cause and never echoes the key.
      console.error(detail.slice(0, 600));
      process.exit(1);
    }
    const page = await res.json();
    models.push(...(page.models ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return models;
}

const all = await fetchAllModels();
const usable = all
  .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
  .map((m) => ({
    id: String(m.name ?? '').replace(/^models\//, ''),
    label: m.displayName ?? '',
    input: m.inputTokenLimit ?? 0,
    output: m.outputTokenLimit ?? 0,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

console.log(`\n${usable.length} model(s) on this key support generateContent, out of ${all.length} listed.\n`);
const width = Math.max(...usable.map((m) => m.id.length), 4);
for (const model of usable) {
  const limits = model.output ? `out ${model.output.toLocaleString()} tok` : '';
  console.log(`  ${model.id.padEnd(width)}  ${limits.padEnd(16)} ${model.label}`);
}

const checks = argValues('check');
if (!checks.length) {
  console.log('\nPick a GEMINI_FALLBACK_MODEL from this list — a lighter or older model than');
  console.log('your primary, so it does not share the same capacity when the primary is busy.');
  console.log('Re-run with --check <model> to confirm one before setting the secret.\n');
  process.exit(0);
}

console.log('');
let missing = 0;
for (const wanted of checks) {
  const id = wanted.replace(/^models\//, '');
  const found = usable.find((m) => m.id === id);
  if (found) {
    console.log(`  ok       ${id} is available and supports generateContent.`);
  } else {
    missing += 1;
    const listed = all.find((m) => String(m.name ?? '').replace(/^models\//, '') === id);
    console.log(
      listed
        ? `  MISSING  ${id} exists but cannot do generateContent — do not use it here.`
        : `  MISSING  ${id} is not available on this key.`,
    );
  }
}
console.log('');
process.exit(missing ? 1 : 0);
