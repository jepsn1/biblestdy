import { getBook } from './books.js'
import type { Reference } from './reference.js'

/**
 * Translation-agnostic scripture references inside a note body (#158): a
 * markdown link whose href is `bible:<USFM book>.<chapter>[.<verse>[-[<chapter>.]<verse>]]`.
 *
 *   bible:JHN.3.16      one verse
 *   bible:JHN.3.16-18   a range in one chapter
 *   bible:ROM.8.28-9.5  a cross-chapter range
 *   bible:PSA.23        a whole chapter
 *
 * Coordinates are canonical (English) versification; no translation id —
 * a verse reference quotes no words, so it resolves in whatever translation
 * the reader is reading (see resolveInChapter). The link text is only a
 * fallback label: UIs generate the label from the href in their language.
 */

/** A reference a note body can cite: always at least a chapter. `endVerse`
 * marks a range; `endChapter` is present only when the range leaves the
 * starting chapter (normalized — `JHN.3.16-3.18` parses as `JHN.3.16-18`).
 * Assignable to `Reference`, so formatReference/referenceHref take it. */
export interface ScriptureRef extends Reference {
  book: string
  chapter: number
}

export const SCRIPTURE_HREF_PREFIX = 'bible:'

const HREF = /^bible:([1-3A-Z][A-Z0-9]{2})\.([1-9]\d*)(?:\.([1-9]\d*)(?:-(?:([1-9]\d*)\.)?([1-9]\d*))?)?$/

/** Parses a `bible:` href; null for anything that isn't valid grammar, an
 * unknown book, a chapter the book lacks, or a backwards range. */
export function parseScriptureHref(href: string): ScriptureRef | null {
  const m = HREF.exec(href.trim())
  if (!m) return null
  const [, bookId, chapterRaw, verseRaw, endChapterRaw, endVerseRaw] = m
  const book = getBook(bookId)
  if (!book) return null
  const chapter = Number(chapterRaw)
  if (chapter > book.chapters) return null
  const ref: ScriptureRef = { book: book.id, chapter }
  if (verseRaw === undefined) return ref
  ref.verse = Number(verseRaw)
  if (endVerseRaw === undefined) return ref
  const endChapter = endChapterRaw === undefined ? chapter : Number(endChapterRaw)
  const endVerse = Number(endVerseRaw)
  if (endChapter > book.chapters || endChapter < chapter) return null
  if (endChapter === chapter && endVerse <= ref.verse) return null
  if (endChapter !== chapter) ref.endChapter = endChapter
  ref.endVerse = endVerse
  return ref
}

/** The href of a reference; null when it can't be one (no chapter, unknown
 * book, a range end without a start verse). Same-chapter ranges drop the
 * end chapter, so format(parse(x)) is the canonical spelling of x. */
export function formatScriptureHref(ref: Reference): string | null {
  const book = getBook(ref.book)
  if (!book || ref.chapter === undefined) return null
  let href = `${SCRIPTURE_HREF_PREFIX}${book.id}.${ref.chapter}`
  if (ref.verse === undefined) return ref.endVerse === undefined ? href : null
  href += `.${ref.verse}`
  if (ref.endVerse === undefined) return href
  const crosses = ref.endChapter !== undefined && ref.endChapter !== ref.chapter
  href += crosses ? `-${ref.endChapter}.${ref.endVerse}` : `-${ref.endVerse}`
  return href
}

/** The normalized form of any Reference-shaped value (e.g. one from
 * parseReference, which always sets endChapter) — null if no chapter. */
export function toScriptureRef(ref: Reference): ScriptureRef | null {
  const href = formatScriptureHref(ref)
  return href === null ? null : parseScriptureHref(href)
}

/** True if the two address the same verses (after normalizing). */
export function sameScriptureRef(a: Reference, b: Reference): boolean {
  const ha = formatScriptureHref(a)
  return ha !== null && ha === formatScriptureHref(b)
}

/**
 * A reference tagged with one of the reader's marks (#216): the link's
 * title, never its href — `[Joh 3,16](bible:JHN.3.16 "mark:hl:<uuid>")`.
 * The href stays plain grammar, so anything that ignores titles (older
 * tabs, saved bodies, other clients) still reads the verse. A highlight is
 * `hl`, a pen mark (annotation) `pen`. The mark lives in one translation;
 * the verses resolve in any.
 */
export type MarkLinkKind = 'highlight' | 'annotation'
export interface MarkLink {
  kind: MarkLinkKind
  id: string
}

const MARK_TITLE = /^mark:(hl|pen):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const KIND_TAG: Record<MarkLinkKind, string> = { highlight: 'hl', annotation: 'pen' }

/** The mark a link's title names; null for no title or any other title. */
export function parseMarkTitle(title: string | null | undefined): MarkLink | null {
  const m = title ? MARK_TITLE.exec(title.trim()) : null
  if (!m) return null
  return { kind: m[1].toLowerCase() === 'hl' ? 'highlight' : 'annotation', id: m[2].toLowerCase() }
}

/** A mark as a link title (`mark:hl:<uuid>`). */
export function formatMarkTitle(mark: MarkLink): string {
  return `mark:${KIND_TAG[mark.kind]}:${mark.id}`
}

/** A reference a body cites, with the mark it was tagged with, if any. */
export type CitedRef = ScriptureRef & { mark?: MarkLink }

/** One `[text](bible:…)` link in a markdown body. */
export interface ScriptureLink {
  ref: ScriptureRef
  /** The mark named by the link's title (#216); absent = a plain ref. */
  mark?: MarkLink
  /** The canonical href (may differ in spelling from the source). */
  href: string
  /** The link text as written, markdown escapes removed — a fallback label. */
  text: string
  /** Character offsets of the whole link `[…](…)` in the body. */
  start: number
  end: number
}

// [text](bible:…) — text may hold escaped brackets; the href may be wrapped
// in <…> and followed by a "title". Malformed hrefs are skipped below.
const LINK = /\[((?:\\.|[^\]\\])*)\]\(\s*<?(bible:[^\s)>]*)>?(?:\s+"([^"]*)")?\s*\)/g

/** Code spans and fenced blocks, blanked (same length) so links shown as
 * code are not references. */
function blankCode(body: string): string {
  const blank = (s: string) => ' '.repeat(s.length)
  let fence: string | null = null
  const lines = body.split('\n').map((line) => {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence === null) {
      if (!open) return line.replace(/(`+)[^`]*?\1/g, blank)
      fence = open[1]
      return blank(line)
    }
    if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null
    return blank(line)
  })
  return lines.join('\n')
}

/** Every valid scripture link in a markdown body, in text order — duplicates
 * included (use refsInMarkdown for the distinct list). */
export function scriptureLinks(body: string): ScriptureLink[] {
  const scan = blankCode(body)
  const out: ScriptureLink[] = []
  for (const m of scan.matchAll(LINK)) {
    // An escaped "\[" is literal text, not a link
    if (m.index > 0 && scan[m.index - 1] === '\\') continue
    const ref = parseScriptureHref(m[2])
    if (!ref) continue
    const mark = parseMarkTitle(m[3])
    out.push({
      ref,
      href: formatScriptureHref(ref)!,
      text: m[1].replace(/\\(.)/g, '$1'),
      start: m.index,
      end: m.index + m[0].length,
      ...(mark && { mark }),
    })
  }
  return out
}

/** The distinct references a body cites, in order of first mention — what
 * the server stores as a note's inline note_ref rows (position = index).
 * One per href (the spotlight's key); its mark is the first one any link
 * to that href names (#216). */
export function refsInMarkdown(body: string): CitedRef[] {
  const byHref = new Map<string, CitedRef>()
  for (const link of scriptureLinks(body)) {
    const seen = byHref.get(link.href)
    if (seen) {
      if (!seen.mark && link.mark) seen.mark = link.mark
      continue
    }
    byHref.set(link.href, link.mark ? { ...link.ref, mark: link.mark } : { ...link.ref })
  }
  return [...byHref.values()]
}

/** The markdown of a link to a reference: `[label](bible:…)`, with the
 * mark as its title when tagged (#216). The label is escaped; null when the
 * reference can't be an href. */
export function scriptureLinkMarkdown(ref: Reference, label: string, mark?: MarkLink | null): string | null {
  const href = formatScriptureHref(ref)
  if (!href) return null
  const title = mark ? ` "${formatMarkTitle(mark)}"` : ''
  return `[${label.replace(/([\\[\]])/g, '\\$1')}](${href}${title})`
}

/** The last chapter a reference touches. */
export function refEndChapter(ref: ScriptureRef): number {
  return ref.endChapter ?? ref.chapter
}

/** True if the reference touches this book + chapter (ranges included:
 * ROM.8.28-9.5 touches 8 and 9). */
export function refTouchesChapter(ref: ScriptureRef, book: string, chapter: number): boolean {
  return ref.book === book && ref.chapter <= chapter && refEndChapter(ref) >= chapter
}
