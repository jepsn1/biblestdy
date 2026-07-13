import type { Note } from './anchor.js'

/** A passage connected to the current chapter through shared notes. */
export interface PassageLink {
  translationId: string
  book: string
  chapter: number
  /** The notes creating the link (id + title, title may be ''). */
  notes: { id: string; title: string }[]
}

/**
 * What the connections panel shows for one chapter (issue #9): the notes
 * anchored here, the passages those notes also anchor to, and the most
 * recently touched notes as re-entry points into study.
 */
export interface ChapterConnections {
  /** Notes with an anchor in this chapter, in text order of their first anchor here. */
  notesHere: Note[]
  /** Other passages sharing a note with this chapter, in canonical order. */
  alsoAppearsIn: PassageLink[]
  /** Most recently updated notes, newest first. */
  recent: Note[]
}
