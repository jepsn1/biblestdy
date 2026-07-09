import type { Reference } from './reference.js'

/**
 * How an annotation attaches to Scripture: a word-span within ONE translation.
 *
 * Offsets are verse-relative WORD indices (0-based, inclusive), not rendered-DOM
 * offsets — verse text is fixed per translation, so these survive re-rendering,
 * reflow, and pagination. Editorial section headings are not verse text and are
 * never anchorable.
 */
export interface Anchor {
  translationId: string
  book: string
  chapter: number
  startVerse: number
  startWord: number
  endVerse: number
  endWord: number
}

/** A single word position within a chapter. */
export interface WordPos {
  verse: number
  word: number
}

/** Split a verse into words the same way everywhere. */
export function words(text: string): string[] {
  const trimmed = text.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** Order two positions: earlier verse first, then earlier word. */
function beforeOrEqual(a: WordPos, b: WordPos): boolean {
  return a.verse < b.verse || (a.verse === b.verse && a.word <= b.word)
}

/**
 * Build a normalized anchor from two selected word positions (in any order).
 */
export function buildAnchor(
  meta: { translationId: string; book: string; chapter: number },
  a: WordPos,
  b: WordPos,
): Anchor {
  const [start, end] = beforeOrEqual(a, b) ? [a, b] : [b, a]
  return {
    ...meta,
    startVerse: start.verse,
    startWord: start.word,
    endVerse: end.verse,
    endWord: end.word,
  }
}

/**
 * For a given verse (with its word count), the inclusive [start, end] word
 * indices this anchor covers — or null if the verse is outside the anchor.
 * Callers use this to wrap the covered words when rendering.
 */
export function wordRangeInVerse(
  anchor: Anchor,
  verse: number,
  wordCount: number,
): { start: number; end: number } | null {
  if (verse < anchor.startVerse || verse > anchor.endVerse) return null
  const start = verse === anchor.startVerse ? anchor.startWord : 0
  const end = verse === anchor.endVerse ? anchor.endWord : wordCount - 1
  if (wordCount === 0 || start > end) return null
  return { start, end }
}

/** Allowed highlight colors (stored by name, not hex — portable + themeable). */
export const HIGHLIGHT_COLORS = ['gold', 'amber', 'green', 'blue', 'rose', 'purple'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'gold'

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(value)
}

/** A persisted highlight: an anchor + color + id (wire type shared with the API). */
export interface Highlight extends Anchor {
  id: string
  color: HighlightColor
}

/** Create payload: an anchor plus a chosen color. */
export interface NewHighlight extends Anchor {
  color: HighlightColor
}

/** A short inline annotation: handwritten scribble anchored to a span. */
export interface Annotation extends Anchor {
  id: string
  text: string
  /** Where the user dragged the annotation box, as an offset from the anchored words'
   * center (px). Null/absent = automatic placement. Anchor-relative so the
   * box travels with its verse across reflow/pagination. */
  offsetX?: number | null
  offsetY?: number | null
  /** User-resized box width (px); null/absent = default. */
  width?: number | null
}

/** Create payload for an annotation. */
export interface NewAnnotation extends Anchor {
  text: string
}

/** One of a note's anchors: an addressable span with its own id (issue #8). */
export interface NoteAnchor extends Anchor {
  id: string
}

/** A note: standalone markdown document anchored to one or more spans. */
export interface Note {
  id: string
  title: string
  body: string
  anchors: NoteAnchor[]
}

/** Create payload for a note: its first anchor plus optional content. */
export interface NewNote extends Anchor {
  title?: string
  body?: string
}

/** The verse range an anchor covers, as a displayable Reference. */
export function anchorReference(a: Anchor): Reference {
  const ref: Reference = { book: a.book, chapter: a.chapter, verse: a.startVerse }
  if (a.endVerse !== a.startVerse) ref.endVerse = a.endVerse
  return ref
}

/** True if the two anchors address the exact same span. */
export function sameAnchor(a: Anchor, b: Anchor): boolean {
  return (
    a.translationId === b.translationId &&
    a.book === b.book &&
    a.chapter === b.chapter &&
    a.startVerse === b.startVerse &&
    a.startWord === b.startWord &&
    a.endVerse === b.endVerse &&
    a.endWord === b.endWord
  )
}
