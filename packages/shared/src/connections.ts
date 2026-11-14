import type { Note } from './anchor.js'
import type { Tag } from './tags.js'

/**
 * What the reader's Notes panel shows for one chapter (issue #9, simplified
 * in the notes plan): the notes anchored here — each with ALL its anchors, so
 * a row can name its other passages — and the topics they touch.
 */
export interface ChapterConnections {
  /** Notes with an anchor in this chapter, in text order of their first anchor here. */
  notesHere: Note[]
  /** Topics this chapter touches (its own tags + tags of notes anchored here),
   * by name. onPassage marks older chapter tags (passage_tag). */
  topics: (Tag & { onPassage: boolean })[]
}
