import type { TranslationInfo } from './types';

/**
 * The full translation catalogue.
 *
 * `isAvailable` is the honest answer to "can we legally serve this text right
 * now?". The four public-domain translations ship with the app, so they are
 * always true. Everything else stays false until an authorised provider key is
 * configured — at which point the `scripture` Edge Function reports which of
 * them the key actually covers and the catalogue is merged with that answer.
 *
 * We never fabricate access to a copyrighted translation.
 */
export const TRANSLATION_CATALOGUE: TranslationInfo[] = [
  {
    abbreviation: 'KJV',
    name: 'King James Version',
    language: 'English',
    provider: 'local',
    providerTranslationId: 'KJV',
    isAvailable: true,
    isPublicDomain: true,
    copyrightNotice:
      'King James Version (1769). Public domain in the United States and most of the world; Crown copyright in the United Kingdom.',
    sortOrder: 10,
  },
  {
    abbreviation: 'BSB',
    name: 'Berean Standard Bible',
    language: 'English',
    provider: 'local',
    providerTranslationId: 'BSB',
    isAvailable: true,
    isPublicDomain: true,
    copyrightNotice:
      'The Berean Standard Bible has been dedicated to the public domain by the Berean Bible translation committee and Bible Hub.',
    sortOrder: 20,
  },
  {
    abbreviation: 'ASV',
    name: 'American Standard Version',
    language: 'English',
    provider: 'local',
    providerTranslationId: 'ASV',
    isAvailable: true,
    isPublicDomain: true,
    copyrightNotice: 'American Standard Version (1901). Public domain.',
    sortOrder: 30,
  },
  {
    abbreviation: 'YLT',
    name: "Young's Literal Translation",
    language: 'English',
    provider: 'local',
    providerTranslationId: 'YLT',
    isAvailable: true,
    isPublicDomain: true,
    copyrightNotice: "Young's Literal Translation (1898). Public domain.",
    sortOrder: 40,
  },

  /* ---------------------------------------------------------------------- */
  /* Prepared, but awaiting an authorised provider. Never shown as readable  */
  /* until a configured provider confirms it can serve them.                 */
  /* ---------------------------------------------------------------------- */
  { abbreviation: 'ESV', name: 'English Standard Version', language: 'English', provider: 'esv', providerTranslationId: 'ESV', isAvailable: false, isPublicDomain: false, copyrightNotice: 'The Holy Bible, English Standard Version® (ESV®), © Crossway. Requires a Crossway ESV API key.', sortOrder: 50 },
  { abbreviation: 'NIV', name: 'New International Version', language: 'English', provider: null, providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'New International Version®, NIV® © Biblica, Inc. Requires a licence from the rights holder.', sortOrder: 60 },
  { abbreviation: 'NKJV', name: 'New King James Version', language: 'English', provider: null, providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'New King James Version® © Thomas Nelson. Requires a licence from the rights holder.', sortOrder: 70 },
  { abbreviation: 'NLT', name: 'New Living Translation', language: 'English', provider: null, providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Holy Bible, New Living Translation © Tyndale House Foundation. Requires a licence from the rights holder.', sortOrder: 80 },
  { abbreviation: 'NASB', name: 'New American Standard Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'New American Standard Bible® © The Lockman Foundation. Requires an authorised API.Bible key.', sortOrder: 90 },
  { abbreviation: 'CSB', name: 'Christian Standard Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Christian Standard Bible® © Holman Bible Publishers. Requires an authorised API.Bible key.', sortOrder: 100 },
  { abbreviation: 'AMP', name: 'Amplified Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Amplified® Bible © The Lockman Foundation. Requires an authorised API.Bible key.', sortOrder: 110 },
  { abbreviation: 'RSV', name: 'Revised Standard Version', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Revised Standard Version © National Council of Churches. Requires an authorised API key.', sortOrder: 120 },
  { abbreviation: 'NRSV', name: 'New Revised Standard Version', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'New Revised Standard Version © National Council of Churches. Requires an authorised API key.', sortOrder: 130 },
  { abbreviation: 'NRSVue', name: 'New Revised Standard Version Updated Edition', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'NRSV Updated Edition © National Council of Churches. Requires an authorised API key.', sortOrder: 140 },
  { abbreviation: 'NET', name: 'New English Translation', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'NET Bible® © Biblical Studies Press. Requires an authorised API key.', sortOrder: 150 },
  { abbreviation: 'WEB', name: 'World English Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: true, copyrightNotice: 'World English Bible. Public domain — awaiting a bundled text or a configured provider.', sortOrder: 160 },
  { abbreviation: 'GNT', name: 'Good News Translation', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Good News Translation © American Bible Society. Requires an authorised API key.', sortOrder: 170 },
  { abbreviation: 'CEV', name: 'Contemporary English Version', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Contemporary English Version © American Bible Society. Requires an authorised API key.', sortOrder: 180 },
  { abbreviation: 'HCSB', name: 'Holman Christian Standard Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Holman Christian Standard Bible® © Holman Bible Publishers. Requires an authorised API key.', sortOrder: 190 },
  { abbreviation: 'LEB', name: 'Lexham English Bible', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Lexham English Bible © Lexham Press. Requires an authorised API key.', sortOrder: 200 },
  { abbreviation: 'MEV', name: 'Modern English Version', language: 'English', provider: null, providerTranslationId: null, isAvailable: false, isPublicDomain: false, copyrightNotice: 'Modern English Version © Military Bible Association. Requires a licence from the rights holder.', sortOrder: 210 },
  { abbreviation: 'DRA', name: 'Douay-Rheims American Edition', language: 'English', provider: 'api.bible', providerTranslationId: null, isAvailable: false, isPublicDomain: true, copyrightNotice: 'Douay-Rheims (Challoner revision). Public domain — awaiting a bundled text or a configured provider.', sortOrder: 220 },
];

/** Translations whose text ships with the app under public domain terms. */
export const LOCAL_TRANSLATIONS = TRANSLATION_CATALOGUE.filter((t) => t.provider === 'local').map(
  (t) => t.abbreviation,
);

export const DEFAULT_TRANSLATION = 'KJV';

export function findTranslation(abbreviation: string): TranslationInfo | undefined {
  const key = abbreviation.trim().toUpperCase();
  return TRANSLATION_CATALOGUE.find((t) => t.abbreviation.toUpperCase() === key);
}

export function isLocalTranslation(abbreviation: string): boolean {
  return LOCAL_TRANSLATIONS.includes(abbreviation.trim().toUpperCase());
}

/** Sorts available translations first, then by the catalogue order. */
export function sortTranslations(list: TranslationInfo[]): TranslationInfo[] {
  return [...list].sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}
