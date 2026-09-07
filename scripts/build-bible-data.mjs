#!/usr/bin/env node
/**
 * Normalises public-domain Bible datasets into the compact per-book JSON files
 * the app serves from `public/scripture/<CODE>/<book-id>.json`.
 *
 * Source: https://github.com/scrollmapper/bible_databases (public-domain texts).
 *
 * Usage:
 *   node scripts/build-bible-data.mjs                 # download sources
 *   node scripts/build-bible-data.mjs --source ./raw  # use local <CODE>.json
 *
 * Output shape (kept terse — these files are shipped to the browser):
 *   { "id": "genesis", "name": "Genesis", "translation": "KJV",
 *     "chapters": [ ["verse 1 text", "verse 2 text", ...], ... ] }
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'public', 'scripture');
const SOURCE_BASE =
  'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json';

/** Translations bundled with the app. All are public domain. */
const TRANSLATIONS = [
  { code: 'KJV', file: 'KJV', name: 'King James Version', year: 1769 },
  { code: 'ASV', file: 'ASV', name: 'American Standard Version', year: 1901 },
  { code: 'YLT', file: 'YLT', name: "Young's Literal Translation", year: 1898 },
  { code: 'BSB', file: 'BSB', name: 'Berean Standard Bible', year: 2023 },
];

async function loadBooksMeta() {
  // Parse the id/source pairs straight out of the TypeScript source so the two
  // never drift apart.
  const src = await readFile(path.join(ROOT, 'src/lib/bible/books.ts'), 'utf8');
  const books = [];
  const re = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*source:\s*'([^']+)',\s*testament:\s*'(old|new)',\s*order:\s*(\d+),\s*chapters:\s*(\d+)/g;
  let m;
  while ((m = re.exec(src))) {
    books.push({ id: m[1], name: m[2], source: m[3], testament: m[4], order: Number(m[5]), chapters: Number(m[6]) });
  }
  if (books.length !== 66) {
    throw new Error(`Expected 66 books parsed from books.ts, got ${books.length}`);
  }
  return books;
}

async function loadSource(translation, sourceDir) {
  if (sourceDir) {
    const local = path.join(sourceDir, `${translation.file}.json`);
    if (existsSync(local)) {
      return JSON.parse(await readFile(local, 'utf8'));
    }
  }
  const url = `${SOURCE_BASE}/${translation.file}.json`;
  process.stdout.write(`  downloading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Collapses whitespace and strips the stray markup a few source rows carry. */
function cleanVerse(text) {
  return String(text ?? '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

async function build() {
  const sourceIdx = process.argv.indexOf('--source');
  const sourceDir = sourceIdx > -1 ? path.resolve(process.argv[sourceIdx + 1]) : null;
  const booksMeta = await loadBooksMeta();

  await rm(OUT_ROOT, { recursive: true, force: true });
  await mkdir(OUT_ROOT, { recursive: true });

  const manifest = [];

  for (const translation of TRANSLATIONS) {
    process.stdout.write(`\n${translation.code} — ${translation.name}\n`);
    const data = await loadSource(translation, sourceDir);
    const byName = new Map(data.books.map((b) => [b.name, b]));
    const outDir = path.join(OUT_ROOT, translation.code);
    await mkdir(outDir, { recursive: true });

    let verseCount = 0;
    const bookIndex = [];

    for (const meta of booksMeta) {
      const raw = byName.get(meta.source);
      if (!raw) throw new Error(`${translation.code}: missing book "${meta.source}"`);
      const chapters = raw.chapters.map((c) => c.verses.map((v) => cleanVerse(v.text)));
      if (chapters.length !== meta.chapters) {
        throw new Error(
          `${translation.code} ${meta.name}: expected ${meta.chapters} chapters, got ${chapters.length}`,
        );
      }
      for (const ch of chapters) {
        if (ch.length === 0) throw new Error(`${translation.code} ${meta.name}: empty chapter`);
        verseCount += ch.length;
      }
      await writeFile(
        path.join(outDir, `${meta.id}.json`),
        JSON.stringify({ id: meta.id, name: meta.name, translation: translation.code, chapters }),
      );
      bookIndex.push({ id: meta.id, verses: chapters.map((c) => c.length) });
    }

    await writeFile(
      path.join(outDir, 'index.json'),
      JSON.stringify({ translation: translation.code, name: translation.name, books: bookIndex }, null, 0),
    );
    manifest.push({ code: translation.code, name: translation.name, year: translation.year, verses: verseCount });
    process.stdout.write(`  ${verseCount.toLocaleString('en-US')} verses written\n`);
  }

  await writeFile(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify({ translations: manifest }, null, 2));
  process.stdout.write(`\nWrote ${manifest.length} translations to public/scripture\n`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
