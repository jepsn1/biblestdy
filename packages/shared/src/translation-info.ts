/**
 * Static facts about the translations we offer, keyed by abbreviation: the
 * native title (API.Bible names can carry an English gloss), a one-line
 * plain-language description and the rights line (en + da). The chooser and
 * the command palette show these without fetching any scripture.
 */
export interface TranslationInfo {
  /** Title in the text's own language, e.g. "Bibelen på hverdagsdansk". */
  name: string
  /** Short name for the nav trigger on wide screens ("WEB · World English"). */
  shortName: string
  /** Order inside its language group (most-read first). */
  rank: number
  /** English gloss of a non-English title, shown in the English UI only. */
  gloss?: string
  description: { en: string; da: string }
  rights: { en: string; da: string }
}

export const TRANSLATION_INFO: Record<string, TranslationInfo> = {
  BPH: {
    name: 'Bibelen på hverdagsdansk',
    shortName: 'Hverdagsdansk',
    rank: 1,
    gloss: 'The Bible in Everyday Danish',
    description: { en: 'Modern, easy Danish', da: 'Moderne, letlæst dansk' },
    rights: { en: '© Bibelselskabet 2015', da: '© Bibelselskabet 2015' },
  },
  NIV: {
    name: 'New International Version',
    shortName: 'New International',
    rank: 1,
    description: { en: 'Modern, readable English', da: 'Moderne, letlæst engelsk' },
    rights: { en: '© Biblica 2011', da: '© Biblica 2011' },
  },
  NKJV: {
    name: 'New King James Version',
    shortName: 'New King James',
    rank: 2,
    description: { en: 'Classic English, literal', da: 'Klassisk engelsk, ordret' },
    rights: { en: '© Thomas Nelson 1982', da: '© Thomas Nelson 1982' },
  },
  WEB: {
    name: 'World English Bible',
    shortName: 'World English',
    rank: 3,
    description: { en: 'Modern English', da: 'Moderne engelsk' },
    rights: { en: 'Public domain', da: 'Fri af ophavsret' },
  },
}

export function translationInfo(abbreviation: string): TranslationInfo | undefined {
  return TRANSLATION_INFO[abbreviation.toUpperCase()]
}
