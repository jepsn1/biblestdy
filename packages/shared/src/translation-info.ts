/**
 * Static facts about the translations we offer, keyed by abbreviation: the
 * native title (API.Bible names can carry an English gloss), a one-line
 * plain-language description and the rights line (en + da). The chooser and
 * the command palette show these without fetching any scripture.
 */
export interface TranslationInfo {
  /** Title in the text's own language, e.g. "Bibelen på hverdagsdansk". */
  name: string
  /** English gloss of a non-English title, shown in the English UI only. */
  gloss?: string
  description: { en: string; da: string }
  rights: { en: string; da: string }
}

export const TRANSLATION_INFO: Record<string, TranslationInfo> = {
  BPH: {
    name: 'Bibelen på hverdagsdansk',
    gloss: 'The Bible in Everyday Danish',
    description: { en: 'Modern, easy-to-read Danish', da: 'Moderne dansk, let at læse' },
    rights: { en: '© Bibelselskabet 2015', da: '© Bibelselskabet 2015' },
  },
  NIV: {
    name: 'New International Version',
    description: { en: 'Modern English, readable and accurate', da: 'Moderne engelsk, letlæst og præcis' },
    rights: { en: '© Biblica 2011', da: '© Biblica 2011' },
  },
  NKJV: {
    name: 'New King James Version',
    description: { en: 'Classic English, close to the original wording', da: 'Klassisk engelsk, tæt på grundteksten' },
    rights: { en: '© Thomas Nelson 1982', da: '© Thomas Nelson 1982' },
  },
  WEB: {
    name: 'World English Bible',
    description: { en: 'Modern English, free to share', da: 'Moderne engelsk, fri at dele' },
    rights: { en: 'Public domain', da: 'Fri af ophavsret' },
  },
}

export function translationInfo(abbreviation: string): TranslationInfo | undefined {
  return TRANSLATION_INFO[abbreviation.toUpperCase()]
}
