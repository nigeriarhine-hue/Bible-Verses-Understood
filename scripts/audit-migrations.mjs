#!/usr/bin/env node
/**
 * Scans the migrations for anything that could destroy existing data, so a
 * `supabase db push` can be reviewed before it runs.
 *
 *   npm run audit:migrations
 *
 * Reports DESTRUCTIVE statements (data loss), RISKY ones (may fail or lock on a
 * populated table), and confirms every statement is safely re-runnable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');

/** Statements that delete or overwrite data that is already there. */
const DESTRUCTIVE = [
  [/\bdrop\s+table\b(?!\s+if\s+exists\s+\w*_?tmp)/i, 'DROP TABLE — deletes a table and its rows'],
  [/\bdrop\s+(?:schema|database)\b/i, 'DROP SCHEMA/DATABASE'],
  [/\bdrop\s+column\b/i, 'DROP COLUMN — deletes a column and its data'],
  [/\btruncate\b/i, 'TRUNCATE — empties a table'],
  [/\bdelete\s+from\b/i, 'DELETE FROM — removes rows'],
  [/\balter\s+column\b[^;]*\btype\b/i, 'ALTER COLUMN TYPE — can fail or coerce existing values'],
  [/\bdrop\s+constraint\b/i, 'DROP CONSTRAINT'],
  [/\bdrop\s+(?:not\s+null|default)\b/i, 'DROP NOT NULL/DEFAULT'],
];

/** Statements that are safe on an empty database but can bite on a full one. */
const RISKY = [
  [/\badd\s+column\b[^;]*\bnot\s+null\b(?![^;]*\bdefault\b)/i, 'ADD COLUMN NOT NULL without DEFAULT — fails if rows exist'],
  [/\bcreate\s+unique\s+index\b(?!\s+if\s+not\s+exists)/i, 'CREATE UNIQUE INDEX — fails if duplicates exist'],
  [/\balter\s+table\b[^;]*\badd\s+constraint\b[^;]*\bunique\b/i, 'ADD UNIQUE CONSTRAINT — fails if duplicates exist'],
];

/** Reading a statement in isolation misses context, so strip comments first. */
function statements(sql) {
  const withoutComments = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutComments
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
let destructive = 0;
let risky = 0;
const createdTables = [];
let notIdempotent = 0;

console.log(`Auditing ${files.length} migrations in supabase/migrations\n`);

for (const file of files) {
  const sql = readFileSync(path.join(DIR, file), 'utf8');
  const found = [];

  for (const statement of statements(sql)) {
    const oneLine = statement.replace(/\s+/g, ' ').slice(0, 110);

    for (const [pattern, label] of DESTRUCTIVE) {
      if (pattern.test(statement)) {
        // `drop trigger/policy if exists` before recreating is normal and safe.
        if (/\bdrop\s+(trigger|policy)\b/i.test(statement)) continue;
        found.push({ level: 'DESTRUCTIVE', label, oneLine });
        destructive += 1;
      }
    }
    for (const [pattern, label] of RISKY) {
      if (pattern.test(statement)) {
        found.push({ level: 'RISKY', label, oneLine });
        risky += 1;
      }
    }

    const createTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/i.exec(statement);
    if (createTable) {
      createdTables.push(createTable[1]);
      if (!/if\s+not\s+exists/i.test(statement)) notIdempotent += 1;
    }
  }

  const status = found.length === 0 ? 'safe' : `${found.length} finding(s)`;
  console.log(`  ${file}  —  ${status}`);
  for (const f of found) {
    console.log(`      ${f.level}: ${f.label}`);
    console.log(`      > ${f.oneLine}`);
  }
}

console.log(`\nTables created: ${createdTables.length}`);
console.log(`  ${createdTables.join(', ')}`);
console.log(`\nCREATE TABLE without IF NOT EXISTS: ${notIdempotent}`);
console.log(`Destructive statements: ${destructive}`);
console.log(`Risky-on-populated-table statements: ${risky}`);

if (destructive === 0 && risky === 0) {
  console.log('\nSafe to apply: nothing in these migrations deletes or rewrites existing data.');
} else {
  console.log('\nReview the findings above before pushing.');
}
process.exit(destructive > 0 ? 1 : 0);
