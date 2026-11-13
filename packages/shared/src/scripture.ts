/** Wire types for Scripture served by the API. */

export interface Translation {
  id: string
  name: string
  abbreviation: string
  /** BCP 47, e.g. 'en', 'da' */
  language: string
}

export interface Verse {
  /** Verse number. A bridge (several source verses merged into one unit, e.g.
   * BPH John 3:14-15) is stored under its FIRST number. */
  verse: number
  /** Printed marker when it differs from `verse` — a bridge, e.g. "14–15". */
  label?: string
  text: string
}

/**
 * Layout metadata (never verse text): a paragraph or poetry line STARTS here.
 * Positioned by verse + word index — the same coordinates as annotation
 * anchors — so adding layout never changes verse text or word offsets.
 */
export interface TextBlock {
  verse: number
  /** Word index (0-based) within the verse where the block starts. */
  word: number
  /** Source joins this line to the previous one without a space, so the break
   * falls INSIDE word `word`: the new block starts at this character of it. */
  char?: number
  /** paragraph = first-line indent; flush = no indent (USFM m, d…);
   * poetry = indented line (USFM q1/q2…) */
  kind: 'paragraph' | 'flush' | 'poetry'
  /** Poetry indent level, 1 = q1. */
  level?: number
  /** A stanza break (blank line, USFM b) comes before this block. */
  stanza?: boolean
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
  /** Paragraph/poetry starts in reading order. Absent = continuous prose. */
  blocks?: TextBlock[]
  /** Attribution/copyright line required by some translation licenses */
  copyright?: string
}
