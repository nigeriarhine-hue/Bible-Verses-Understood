import { describe, expect, it } from 'vitest';
import { detectIntent } from './search';

describe('detectIntent', () => {
  it('recognises exact references', () => {
    for (const query of ['John 3:16', 'Psalm 23', 'Romans 8:28-30', '1 Cor 13', 'Jn 3:16']) {
      expect(detectIntent(query)?.kind, query).toBe('reference');
    }
  });

  it('recognises topics', () => {
    const cases: Array<[string, string]> = [
      ['What does the Bible say about anxiety?', 'anxiety'],
      ['Verses about forgiveness', 'forgiveness'],
      ['forgiveness', 'forgiveness'],
      ['worry', 'anxiety'],
      ['relationship', 'relationships'],
      ['bible verses about hope', 'hope'],
    ];
    for (const [query, slug] of cases) {
      const intent = detectIntent(query);
      expect(intent?.kind, query).toBe('topic');
      expect(intent?.kind === 'topic' && intent.slug, query).toBe(slug);
    }
  });

  it('finds the topic inside a sentence somebody wrote about themselves', () => {
    // Life-situation guidance is gone, so these have to reach a topic that
    // exists rather than a page that does not.
    for (const [query, slug] of [
      ["I'm grieving.", 'grief'],
      ["I can't forgive someone.", 'forgiveness'],
      ['My relationship is struggling.', 'relationships'],
      ["I'm worried about my future.", 'anxiety'],
    ] as const) {
      const intent = detectIntent(query);
      expect(intent?.kind, query).toBe('topic');
      expect(intent?.kind === 'topic' && intent.slug, query).toBe(slug);
    }
  });

  it('hands anything it cannot place to the topic browser, with the query', () => {
    const intent = detectIntent('Why did Jesus speak in parables?');
    expect(intent?.kind).toBe('browse');
    expect(intent?.kind === 'browse' && intent.query).toBe('Why did Jesus speak in parables?');
  });

  it('no longer routes anything to life-situation guidance', () => {
    for (const query of [
      "I'm scared about losing my job.",
      'How should I handle conflict?',
      'Something nobody has a topic for',
    ]) {
      expect(detectIntent(query)?.kind, query).not.toBe('situation');
    }
  });

  it('returns nothing for an empty query', () => {
    expect(detectIntent('   ')).toBeNull();
  });
});
