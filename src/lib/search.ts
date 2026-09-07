import { parseReference } from './bible/reference';
import type { BibleReference } from './bible/types';
import { TOPICS } from '../data/topics';

/**
 * Works out what a reader meant by what they typed.
 *
 * The search box is the front door for four different things: an exact verse or
 * range, a chapter, a topic, and a sentence about their own life. Getting this
 * right is what makes one field enough.
 */
export type SearchIntent =
  | { kind: 'reference'; reference: BibleReference }
  | { kind: 'topic'; slug: string; name: string }
  | { kind: 'situation'; query: string };

const TOPIC_LOOKUP = new Map<string, { slug: string; name: string }>();
for (const topic of TOPICS) {
  TOPIC_LOOKUP.set(topic.name.toLowerCase(), { slug: topic.slug, name: topic.name });
  TOPIC_LOOKUP.set(topic.slug.replace(/-/g, ' '), { slug: topic.slug, name: topic.name });
}
// A few natural synonyms readers actually type.
const TOPIC_SYNONYMS: Record<string, string> = {
  worry: 'anxiety',
  worried: 'anxiety',
  anxious: 'anxiety',
  afraid: 'fear',
  scared: 'fear',
  depression: 'discouragement',
  depressed: 'discouragement',
  sad: 'grief',
  mourning: 'grief',
  lonely: 'loneliness',
  alone: 'loneliness',
  forgive: 'forgiveness',
  forgiving: 'forgiveness',
  thankful: 'gratitude',
  thankfulness: 'gratitude',
  giving: 'generosity',
  finances: 'money',
  job: 'career',
  jobs: 'career',
  marriage: 'marriage',
  parenting: 'parenting',
  children: 'parenting',
  kids: 'parenting',
  friends: 'friendship',
  praying: 'prayer',
  guidance: 'guidance',
  direction: 'guidance',
  calling: 'calling',
  suffering: 'perseverance',
  waiting: 'patience',
  sickness: 'healing',
  illness: 'healing',
};

/** Phrases that mean "the reader is telling us about their life". */
const PERSONAL_MARKERS =
  /\b(i'?m|i am|i feel|i felt|i can'?t|i cannot|i don'?t|i do not|my |me |we'?re|we are|our )/i;

export function detectIntent(rawQuery: string): SearchIntent | null {
  const query = rawQuery.trim();
  if (!query) return null;

  // 1. An exact reference always wins — "John 3:16" is never a topic.
  const reference = parseReference(query);
  if (reference) return { kind: 'reference', reference };

  const normalised = query.toLowerCase().replace(/[?.!,]/g, '').replace(/\s+/g, ' ').trim();

  // 2. Something about the reader's own situation goes to life-situation search.
  if (PERSONAL_MARKERS.test(query)) return { kind: 'situation', query };

  // 3. "verses about X", "what does the bible say about X" → topic if we have one.
  const aboutMatch =
    /(?:what does the bible say about|what the bible says about|bible verses about|verses about|scriptures? about|passages about|about)\s+(.+)$/.exec(
      normalised,
    );
  const subject = (aboutMatch?.[1] ?? normalised).trim();

  const topic = lookupTopic(subject);
  if (topic) return { kind: 'topic', ...topic };

  // 4. A bare word or two that matches a topic.
  if (!aboutMatch && subject.split(' ').length <= 3) {
    const fuzzy = lookupTopic(subject);
    if (fuzzy) return { kind: 'topic', ...fuzzy };
  }

  // 5. Anything else is a question or a description — let the guidance search
  //    handle it, which is better at open-ended wording than a keyword match.
  return { kind: 'situation', query };
}

function lookupTopic(subject: string): { slug: string; name: string } | null {
  const cleaned = subject.replace(/^(the|a|an)\s+/, '').trim();
  const direct = TOPIC_LOOKUP.get(cleaned);
  if (direct) return direct;

  const synonym = TOPIC_SYNONYMS[cleaned];
  if (synonym) {
    const topic = TOPICS.find((t) => t.slug === synonym);
    if (topic) return { slug: topic.slug, name: topic.name };
  }

  // Singular/plural tolerance: "relationship" → "relationships".
  for (const candidate of [`${cleaned}s`, cleaned.replace(/s$/, '')]) {
    const match = TOPIC_LOOKUP.get(candidate);
    if (match) return match;
  }
  return null;
}

/** Example prompts shown under the search field on the home page. */
export const SEARCH_EXAMPLES = [
  'John 3:16',
  'Psalm 23',
  'Romans 8:28-30',
  'What does the Bible say about anxiety?',
  'Verses about forgiveness',
  "I'm worried about my future.",
  "I'm struggling with grief.",
  'How should I handle conflict?',
];
