import type { Annotation, Highlight, Note } from './anchor.js'

/** How long a deleted note, highlight or margin note can be restored (#261):
 * kept server-side this long, listed under "Recently deleted", then purged. */
export const TRASH_DAYS = 30
export const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

/** A deleted item and when it went (ISO time). */
export type Deleted<T> = T & { deletedAt: string }

/** GET /api/trash: the user's deleted study, newest first. Blank notes (no
 * title, no text) aren't listed — nothing to bring back. */
export interface TrashList {
  notes: Deleted<Note>[]
  highlights: Deleted<Highlight>[]
  annotations: Deleted<Annotation>[]
}

/** Days left before a deletion is final, rounded up (30 right after, 1 on the last day, 0 once gone). */
export function daysLeft(deletedAt: string, now = Date.now()): number {
  const left = Date.parse(deletedAt) + TRASH_MS - now
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)))
}
