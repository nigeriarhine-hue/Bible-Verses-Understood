import { describe, expect, it } from 'vitest';
import {
  findReferencesInText,
  formatReference,
  parseReference,
  pathToReference,
  referenceToPath,
} from './reference';

const ref = (input: string) => parseReference(input);

describe('parseReference — formats required by the product spec', () => {
  const cases: Array<[string, string]> = [
    ['John 3:16', 'John 3:16'],
    ['John3:16', 'John 3:16'],
    ['John 3 16', 'John 3:16'],
    ['Jn 3:16', 'John 3:16'],
    ['jn3:16', 'John 3:16'],
    ['Psalm twenty-three', 'Psalms 23'],
    ['Psalm twenty three', 'Psalms 23'],
    ['Romans eight twenty-eight', 'Romans 8:28'],
    ['1 Cor 13', '1 Corinthians 13'],
    ['First Corinthians 13', '1 Corinthians 13'],
    ['1Cor13', '1 Corinthians 13'],
    ['I Corinthians 13:4-7', '1 Corinthians 13:4-7'],
    ['Romans 8:28-30', 'Romans 8:28-30'],
    ['Psalm 23', 'Psalms 23'],
    ['psalm 119', 'Psalms 119'],
    ['Psalm one hundred nineteen', 'Psalms 119'],
    ['GENESIS 50:20', 'Genesis 50:20'],
    ['gen 50 20', 'Genesis 50:20'],
    ['Song of Songs 2:1', 'Song of Solomon 2:1'],
    ['Revelation 21:4', 'Revelation 21:4'],
    ['Rev 21:4', 'Revelation 21:4'],
    ['3 John 2', '3 John 1:2'],
    ['Jude 24', 'Jude 1:24'],
    ['Philemon 6', 'Philemon 1:6'],
    ['Matthew 6 verse 33', 'Matthew 6:33'],
    ['James 1:2 through 4', 'James 1:2-4'],
    ['Romans 8:38-9:2', 'Romans 8:38-9:2'],
    ['2nd Timothy 1:7', '2 Timothy 1:7'],
    ['ii timothy 1:7', '2 Timothy 1:7'],
    ['Proverbs 3:5-6', 'Proverbs 3:5-6'],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    expect(ref(input)?.reference).toBe(expected);
  });

  it('strips conversational lead-ins', () => {
    expect(ref('what does Romans 8:28 mean?')?.reference).toBe('Romans 8:28');
    expect(ref('explain John 3:16')?.reference).toBe('John 3:16');
    expect(ref('show me Psalm 23')?.reference).toBe('Psalms 23');
  });

  it('rejects things that are not references', () => {
    expect(ref('anxiety')).toBeNull();
    expect(ref('What does the Bible say about forgiveness?')).toBeNull();
    expect(ref("I'm worried about my future.")).toBeNull();
    expect(ref('verses about hope')).toBeNull();
    expect(ref('')).toBeNull();
  });

  it('rejects chapters outside the canon', () => {
    expect(ref('John 99:1')).toBeNull();
    expect(ref('Jude 2:1')).toBeNull();
    expect(ref('Obadiah 3:1')).toBeNull();
  });

  it('keeps whole-chapter references distinct from verse references', () => {
    expect(ref('Psalm 23')?.startVerse).toBeNull();
    expect(ref('Psalm 23:1')?.startVerse).toBe(1);
  });

  it('parses ranges', () => {
    const range = ref('James 1:2-4');
    expect(range?.startVerse).toBe(2);
    expect(range?.endVerse).toBe(4);
  });

  it('ignores a backwards range rather than failing', () => {
    expect(ref('John 3:16-14')?.reference).toBe('John 3:16');
  });
});

describe('strict mode', () => {
  it('only accepts input that is entirely a reference', () => {
    expect(parseReference('Romans 8:28', { strict: true })?.reference).toBe('Romans 8:28');
    expect(parseReference('Romans 8:28 is my favourite', { strict: true })).toBeNull();
  });
});

describe('URL round-tripping', () => {
  const inputs = ['John 3:16', 'Romans 8:28-30', 'Psalms 23', '1 Corinthians 13:4-7', 'Romans 8:38-9:2'];
  it.each(inputs)('round-trips %s', (input) => {
    const parsed = parseReference(input)!;
    const path = referenceToPath(parsed);
    const [, , bookId, chapter, verse] = path.split('/');
    expect(pathToReference(bookId, chapter, verse)?.reference).toBe(parsed.reference);
  });

  it('rejects an unknown book slug', () => {
    expect(pathToReference('hezekiah', '1', '1')).toBeNull();
  });
});

describe('formatReference', () => {
  it('renders the shapes we display', () => {
    const base = { bookId: 'romans', book: 'Romans', chapter: 8 };
    expect(formatReference({ ...base, startVerse: null, endVerse: null })).toBe('Romans 8');
    expect(formatReference({ ...base, startVerse: 28, endVerse: null })).toBe('Romans 8:28');
    expect(formatReference({ ...base, startVerse: 28, endVerse: 30 })).toBe('Romans 8:28-30');
    expect(formatReference({ ...base, startVerse: 38, endVerse: 2, endChapter: 9 })).toBe('Romans 8:38-9:2');
  });
});

describe('findReferencesInText', () => {
  it('finds every reference in a paragraph of commentary', () => {
    const text =
      'This echoes Genesis 50:20, and Jeremiah 29:11 makes a similar promise. See also James 1:2-4 and Philippians 1:6.';
    expect(findReferencesInText(text).map((m) => m.reference.reference)).toEqual([
      'Genesis 50:20',
      'Jeremiah 29:11',
      'James 1:2-4',
      'Philippians 1:6',
    ]);
  });

  it('does not invent references from ordinary prose', () => {
    expect(findReferencesInText('He waited 40 years and then walked 3 miles.')).toEqual([]);
    expect(findReferencesInText('There is no book called Hezekiah 3:4.')).toEqual([]);
  });
});
