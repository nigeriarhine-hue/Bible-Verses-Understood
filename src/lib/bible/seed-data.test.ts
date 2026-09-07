import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAILY_VERSE_POOL, dailyVerseFor } from '../../data/daily-verses';
import { TOPICS } from '../../data/topics';
import { BOOKS } from './books';
import { parseReference } from './reference';

/**
 * Every curated reference we ship — topic verses, the Verse of the Day pool and
 * the SQL seed — must resolve to a chapter and verse that actually exists in
 * the bundled Scripture data. This is the guard against a plausible-looking but
 * non-existent citation reaching a reader.
 */

const ROOT = path.resolve(__dirname, '../../..');

interface BookIndex {
  books: Array<{ id: string; verses: number[] }>;
}

const index = JSON.parse(
  readFileSync(path.join(ROOT, 'public/scripture/KJV/index.json'), 'utf8'),
) as BookIndex;
const verseCounts = new Map(index.books.map((b) => [b.id, b.verses]));

function checkReference(raw: string): string | null {
  const parsed = parseReference(raw, { strict: true });
  if (!parsed) return `could not be parsed`;
  const chapters = verseCounts.get(parsed.bookId);
  if (!chapters) return `unknown book "${parsed.bookId}"`;
  const verseTotal = chapters[parsed.chapter - 1];
  if (!verseTotal) return `${parsed.book} has no chapter ${parsed.chapter}`;
  if (parsed.startVerse !== null && parsed.startVerse > verseTotal) {
    return `${parsed.book} ${parsed.chapter} has ${verseTotal} verses, not ${parsed.startVerse}`;
  }
  const endChapterTotal = parsed.endChapter ? chapters[parsed.endChapter - 1] : verseTotal;
  if (parsed.endVerse !== null && endChapterTotal && parsed.endVerse > endChapterTotal) {
    return `end verse ${parsed.endVerse} is past the end of the chapter (${endChapterTotal})`;
  }
  return null;
}

describe('bundled Scripture data', () => {
  it('has all 66 books in every translation', () => {
    for (const code of ['KJV', 'ASV', 'YLT', 'BSB']) {
      const file = JSON.parse(
        readFileSync(path.join(ROOT, `public/scripture/${code}/index.json`), 'utf8'),
      ) as BookIndex;
      expect(file.books, code).toHaveLength(66);
      for (const book of BOOKS) {
        const entry = file.books.find((b) => b.id === book.id);
        expect(entry, `${code} ${book.id}`).toBeDefined();
        expect(entry!.verses.length, `${code} ${book.name} chapters`).toBe(book.chapters);
      }
    }
  });
});

describe('curated topic verses', () => {
  const entries = TOPICS.flatMap((topic) =>
    topic.verses.map((verse) => [`${topic.slug} → ${verse.reference}`, verse.reference] as const),
  );

  it('covers every topic the product lists', () => {
    expect(TOPICS.length).toBeGreaterThanOrEqual(50);
    for (const topic of TOPICS) {
      expect(topic.verses.length, topic.slug).toBeGreaterThanOrEqual(4);
    }
  });

  it.each(entries)('%s exists in Scripture', (_label, reference) => {
    expect(checkReference(reference), reference).toBeNull();
  });
});

describe('Verse of the Day pool', () => {
  it.each(DAILY_VERSE_POOL.map((r) => [r] as const))('%s exists in Scripture', (reference) => {
    expect(checkReference(reference), reference).toBeNull();
  });

  it('has no duplicates', () => {
    expect(new Set(DAILY_VERSE_POOL).size).toBe(DAILY_VERSE_POOL.length);
  });

  it('picks the same verse the SQL seed picked for a date', () => {
    const sql = readFileSync(
      path.join(ROOT, 'supabase/migrations/20260907120400_seed_reference_data.sql'),
      'utf8',
    );
    const rows = [...sql.matchAll(/\('(\d{4}-\d{2}-\d{2})', '((?:[^']|'')+)', 'KJV'\)/g)];
    expect(rows.length).toBeGreaterThan(700);
    for (const [, date, reference] of rows.slice(0, 400)) {
      const [year, month, day] = date.split('-').map(Number);
      expect(dailyVerseFor(new Date(Date.UTC(year, month - 1, day))), date).toBe(
        reference.replace(/''/g, "'"),
      );
    }
  });
});

describe('SQL seed', () => {
  const sql = readFileSync(
    path.join(ROOT, 'supabase/migrations/20260907120400_seed_reference_data.sql'),
    'utf8',
  );

  it('seeds every topic in the TypeScript catalogue', () => {
    for (const topic of TOPICS) {
      expect(sql, topic.slug).toContain(`('${topic.slug}', '${topic.name.replace(/'/g, "''")}'`);
    }
  });

  it('marks only bundled public-domain translations as available', () => {
    const available = [...sql.matchAll(/\('([A-Za-z]+)', '[^']*(?:''[^']*)*', 'English', '([^']*)'[^)]*?, true, true,/g)].map(
      (m) => m[1],
    );
    expect(new Set(available)).toEqual(new Set(['KJV', 'BSB', 'ASV', 'YLT']));
  });
});
