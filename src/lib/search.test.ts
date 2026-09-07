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

  it('recognises life situations', () => {
    for (const query of [
      "I'm scared about losing my job.",
      "I'm grieving.",
      "I can't forgive someone.",
      'My relationship is struggling.',
      "I don't know my purpose.",
    ]) {
      expect(detectIntent(query)?.kind, query).toBe('situation');
    }
  });

  it('sends open questions to guidance rather than guessing a topic', () => {
    expect(detectIntent('How should I handle conflict?')?.kind).toBe('situation');
    expect(detectIntent('Why did Jesus speak in parables?')?.kind).toBe('situation');
  });

  it('returns nothing for an empty query', () => {
    expect(detectIntent('   ')).toBeNull();
  });
});
