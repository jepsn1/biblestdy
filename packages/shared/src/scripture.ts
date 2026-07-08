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

export interface Chapter {
  translationId: string
  book: string
  chapter: number
  verses: Verse[]
  /** Attribution/copyright line required by some translation licenses */
  copyright?: string
}
