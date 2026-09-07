import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The boundaries this product promises never to cross live in the Edge Function
 * prompts. They are easy to weaken by accident while editing prompt wording, so
 * they are pinned here.
 */
const ROOT = path.resolve(__dirname, '../../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

/** Prompt text is wrapped for readability, so match against a flattened copy. */
const flatten = (text: string) => text.replace(/\s+/g, ' ');

const prompts = read('supabase/functions/_shared/prompts.ts');
const situation = read('supabase/functions/situation/index.ts');
const flatPrompts = flatten(prompts);
const flatSituation = flatten(situation);

describe('spiritual guidance boundaries', () => {
  it.each([
    ['God told you', 'never claims to speak for God about the reader'],
    ['God is saying you will', 'never puts words in God’s mouth about the future'],
    ['this guarantees', 'never guarantees an outcome'],
    ['God definitely wants you to', 'never asserts a personal directive'],
  ])('forbids "%s" — %s', (phrase) => {
    expect(flatPrompts.toLowerCase()).toContain(phrase.toLowerCase());
  });

  it.each([
    'this passage may encourage you to',
    'a biblical principle that may apply is',
    'one way Christians interpret this passage is',
    'this Scripture can provide a framework for',
  ])('offers the permitted framing "%s"', (phrase) => {
    expect(flatPrompts.toLowerCase()).toContain(phrase.toLowerCase());
  });

  it('forbids predicting an individual’s future', () => {
    expect(flatPrompts).toMatch(/never predict any individual's future/i);
  });

  it('requires fair treatment of differing Christian interpretations', () => {
    expect(flatPrompts).toMatch(/traditions read a passage differently/i);
    expect(flatPrompts).toMatch(/represent the major positions fairly/i);
  });

  it('forbids the model from supplying Bible text', () => {
    expect(flatPrompts).toMatch(/Never quote, paraphrase or invent Bible text/i);
    expect(flatPrompts).toMatch(/do not reproduce a different wording/i);
  });

  it('says a study aid is not a pastor, counsellor or doctor', () => {
    expect(flatPrompts).toMatch(/not a pastor, counsellor, therapist or doctor/i);
  });

  it('directs readers in crisis towards real support', () => {
    expect(flatPrompts).toMatch(/qualified professionals/i);
    expect(flatSituation).toMatch(/crisis line/i);
  });
});

describe('explanation modes', () => {
  it('uses the product’s exact section headings for the simple explanation', () => {
    for (const heading of ['Meaning', 'Why It Matters', 'For Your Life Today', 'Moving Forward']) {
      expect(flatPrompts).toContain(`"${heading}"`);
    }
  });

  it('offers the deep explanation’s sections', () => {
    for (const heading of [
      'The Verse in Context',
      'Historical and Cultural Context',
      'Key Words and Phrases',
      'Original Hebrew or Greek',
      'Practical Application',
    ]) {
      expect(flatPrompts).toContain(`"${heading}"`);
    }
  });

  it('asks the scholar explanation to cover disagreement honestly', () => {
    expect(flatPrompts).toMatch(/History of Interpretation/);
    expect(flatPrompts).toMatch(/Common Misunderstandings/);
    expect(flatPrompts).toMatch(/without\s+caricature/i);
  });

  it('uses the life-situation sections the product specifies', () => {
    for (const heading of [
      "What You're Facing",
      'What the Passage Means',
      'How It May Apply',
      'Something to Consider',
      'A Practical Next Step',
    ]) {
      expect(flatSituation).toContain(heading.replace("'", "\\'"));
    }
  });
});
