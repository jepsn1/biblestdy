import { refEndChapter, refTouchesChapter, type ScriptureRef } from './scripture-href.js'

/** An inclusive verse range (`end` may be Infinity = to the chapter end). */
export type VerseRange = { start: number; end: number }

/**
 * The stored verses a range lands on (the reader's ?v= jump). A verse inside
 * a bridge (BPH 3:15, stored under 14 as "14–15") resolves to the bridge;
 * past the last verse clamps to it. `verses` = the chapter's verse numbers
 * in order. Forgiving by design — resolveInChapter is the strict one.
 */
export function targetVerses(verses: number[], range: VerseRange): VerseRange | null {
  if (verses.length === 0) return null
  const at = (n: number) => {
    let hit = verses[0]
    for (const v of verses) if (v <= n) hit = v
    return hit
  }
  return { start: at(range.start), end: at(range.end) }
}

/** A verse unit of a chapter as served (Verse is one): a bridge is stored
 * under its first number with a printed label ("14–15"). */
export interface VerseUnit {
  verse: number
  label?: string
}

/** The part of a chapter the resolver needs (Chapter is one). */
export interface ChapterVerses {
  book: string
  chapter: number
  verses: readonly VerseUnit[]
}

/** Where a reference lands in one chapter of one translation. */
export interface ResolvedRange {
  /** Stored verse numbers (Verse.verse) of the first and last unit covered —
   * what marks, scrolling and ?v= use. */
  startVerse: number
  endVerse: number
  /** The printed verse numbers those units span: BPH John 3:15 → 14–15. */
  printedStart: number
  printedEnd: number
  /** A bridge made the span wider than asked ("Joh 3,15 · i BPH 3,14–15"). */
  bridged: boolean
  /** The asked range ran past this chapter's last verse and was cut there. */
  clamped: boolean
}

/** `notInTranslation` = this translation has no such chapter (404) or none
 * of the asked verses (e.g. BPH Mal 4, a verse omitted in a gap): say so,
 * never guess a neighbour. */
export type Resolution = ResolvedRange | 'notInTranslation'

/** Last printed number a unit covers ("14–15" → 15). */
function unitEnd(u: VerseUnit): number {
  const m = u.label ? /(\d+)\D*$/.exec(u.label) : null
  const n = m ? Number(m[1]) : u.verse
  return n > u.verse ? n : u.verse
}

/**
 * Resolves a canonical reference in a loaded chapter of some translation.
 * `chapter` null/undefined = the translation doesn't have it (404).
 * Returns null when the reference doesn't touch this chapter at all.
 *
 * - A verse inside a bridge resolves to the whole bridge (`bridged`).
 * - A range ending inside a bridge widens to the bridge's end.
 * - A cross-chapter range covers the rest/start of each chapter it spans.
 * - A range end past the last verse clamps (`clamped`); a reference whose
 *   verses are all missing (past the end, or in a numbering gap) is
 *   `notInTranslation` — never the nearest verse.
 */
export function resolveInChapter(
  ref: ScriptureRef,
  chapter: ChapterVerses | null | undefined,
): Resolution | null {
  if (!chapter) return 'notInTranslation'
  if (!refTouchesChapter(ref, chapter.book, chapter.chapter)) return null
  const c = chapter.chapter
  const units = [...chapter.verses].sort((a, b) => a.verse - b.verse)
  if (units.length === 0) return 'notInTranslation'

  const askedStart = ref.chapter === c && ref.verse !== undefined ? ref.verse : 1
  const askedEnd =
    ref.verse === undefined
      ? Infinity
      : ref.endVerse === undefined
        ? ref.verse
        : refEndChapter(ref) === c
          ? ref.endVerse
          : Infinity

  const hit = units.filter((u) => u.verse <= askedEnd && unitEnd(u) >= askedStart)
  if (hit.length === 0) return 'notInTranslation'
  const first = hit[0]
  const last = hit[hit.length - 1]
  const printedStart = first.verse
  const printedEnd = unitEnd(last)
  const lastPrinted = unitEnd(units[units.length - 1])
  return {
    startVerse: first.verse,
    endVerse: last.verse,
    printedStart,
    printedEnd,
    bridged: printedStart < askedStart || printedEnd > askedEnd,
    clamped: askedEnd !== Infinity && askedEnd > lastPrinted,
  }
}
