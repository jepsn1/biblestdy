/** Wire types for Scripture served by the API. */

export interface Translation {
  id: string
  name: string
  abbreviation: string
  /** BCP 47, e.g. 'en', 'da' */
  language: string
}

export interface Verse {
  verse: number
  text: string
}

/**
 * Editorial section heading (e.g. "Jesus Teaches Nicodemus"). Not Scripture:
 * kept separate from verse text so annotations can never anchor to it.
 */
export interface Section {
  beforeVerse: number
  title: string
}

export interface Chapter {
  translationId: string
  book: string
  chapter: number
  verses: Verse[]
  sections?: Section[]
  /** Attribution/copyright line required by some translation licenses */
  copyright?: string
}
