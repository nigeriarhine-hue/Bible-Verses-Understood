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
// The study and devotional prompts live in the shared generator, which is what
// both the request handlers and the scheduled prewarm call.
const devotional = read('supabase/functions/_shared/generate.ts');
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

describe('the simple explanation, the only one that generates', () => {
  it('uses the product’s exact section headings', () => {
    for (const heading of ['Meaning', 'For Your Life Today']) {
      expect(flatPrompts).toContain(`"${heading}"`);
    }
  });

  it('caps the whole explanation at 300 words, not 300 per section', () => {
    expect(flatPrompts).toMatch(
      /summary and both section bodies together must come to 300 words or fewer/i,
    );
    expect(flatPrompts).toMatch(/hard limit/i);
    expect(flatPrompts).toMatch(/Do not pad to reach 300/i);
  });

  it('budgets the parts so they add up to the whole', () => {
    expect(flatPrompts).toMatch(/40-60 words/);
    expect(flatPrompts).toMatch(/100-140 words/);
    expect(flatPrompts).toMatch(/70-100 words/);
  });

  it('asks for the qualities that keep a short answer worth reading', () => {
    for (const instruction of [
      /Be concise/i,
      /No repetition/i,
      /No long introduction/i,
      /No closing summary/i,
      /Plain language/i,
      /Biblically grounded/i,
      /Practical/i,
      /Keep commentary and Scripture separate/i,
      /Never claim direct revelation/i,
      /Never predict this reader's future/i,
    ]) {
      expect(flatPrompts).toMatch(instruction);
    }
  });

  it('keeps related Scripture, which is not counted against the limit', () => {
    expect(flatPrompts).toMatch(/Related Scripture explanations are not counted/i);
    expect(flatPrompts).toMatch(/For relatedScripture/);
  });

  it('carries no deep or scholar instructions any more', () => {
    expect(flatPrompts).not.toMatch(/DEEP EXPLANATION/);
    expect(flatPrompts).not.toMatch(/SCHOLAR EXPLANATION/);
    expect(flatPrompts).not.toMatch(/History of Interpretation/);
    expect(flatPrompts).not.toMatch(/FOLLOWUP_SCHEMA/);
  });

  it('caps life-situation guidance at 500 words without trimming its care', () => {
    expect(flatSituation).toMatch(/hard limit/i);
    expect(flatSituation).toMatch(/must come to 500 words or fewer/i);
    expect(flatSituation).toMatch(/Aim for 300-450/);
    // Length is taken out of the explanation, never out of the safety guidance.
    // The instruction wraps across two source strings, so match both halves.
    expect(flatSituation).toMatch(/never less about their/i);
    expect(flatSituation).toMatch(/safety: the care above is not something to trim/i);
    expect(flatSituation).toMatch(/local crisis line/);
    expect(flatSituation).toMatch(/qualified professional/);
  });

  it('keeps the devotional short without stripping it', () => {
    const flatDevotional = flatten(devotional);
    expect(flatDevotional).toMatch(/350-450 words/);
    expect(flatDevotional).toMatch(/Be concise and do not/i);
    expect(flatDevotional).toMatch(/repeat between sections/i);
    // Source strings escape the apostrophe, so match what is written.
    for (const heading of ["Today\\'s Thought", 'Deeper Reflection', 'One Small Action']) {
      expect(flatDevotional).toContain(heading);
    }
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
