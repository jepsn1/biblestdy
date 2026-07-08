import { bookIndex, findBook, getBook } from './books.js'

/**
 * A Scripture reference: a whole book, a chapter, a verse, or a
 * (possibly cross-chapter) verse range. Canonical addressing for
 * everything that anchors to Scripture.
 */
export interface Reference {
  book: string
  chapter?: number
  verse?: number
  /** Range end; only present together with `verse`. */
  endChapter?: number
  endVerse?: number
}

// "John 3:16-4:2" | "1 John 2,3" | "Song of Solomon" | "ps 23:1-6"
// book part = everything up to the last leading-digit-free boundary;
// verse separator is ':' (en) or ',' (da).
const REF_PATTERN =
  /^\s*(\d?\s*[\p{L}][\p{L}\s.]*?)\s*(?:(\d+)\s*(?:[:,]\s*(\d+))?\s*(?:-\s*(?:(\d+)\s*[:,]\s*)?(\d+))?)?\s*$/u

export function parseReference(input: string): Reference | null {
  const match = REF_PATTERN.exec(input)
  if (!match) return null

  const [, bookRaw, chapterRaw, verseRaw, endChapterRaw, endRaw] = match
  const book = findBook(bookRaw.replace(/\./g, ''))
  if (!book) return null

  if (chapterRaw === undefined) return { book: book.id }

  const chapter = Number(chapterRaw)
  if (chapter < 1 || chapter > book.chapters) return null
  if (verseRaw === undefined) {
    // "John 3" — but "John 3-5" (chapter range) is not supported; reject a dangling range
    if (endRaw !== undefined) return null
    return { book: book.id, chapter }
  }

  const verse = Number(verseRaw)
  if (verse < 1) return null
  const ref: Reference = { book: book.id, chapter, verse }

  if (endRaw !== undefined) {
    const endVerse = Number(endRaw)
    const endChapter = endChapterRaw !== undefined ? Number(endChapterRaw) : chapter
    if (endChapter < chapter || endChapter > book.chapters) return null
    if (endChapter === chapter && endVerse <= verse) return null
    ref.endChapter = endChapter
    ref.endVerse = endVerse
  }
  return ref
}

export function formatReference(ref: Reference): string {
  const book = getBook(ref.book)
  const name = book?.name ?? ref.book
  if (ref.chapter === undefined) return name
  if (ref.verse === undefined) return `${name} ${ref.chapter}`
  let out = `${name} ${ref.chapter}:${ref.verse}`
  if (ref.endVerse !== undefined) {
    out +=
      ref.endChapter !== undefined && ref.endChapter !== ref.chapter
        ? `-${ref.endChapter}:${ref.endVerse}`
        : `-${ref.endVerse}`
  }
  return out
}

/** Canonical order over verse positions. Book-only/chapter-only sort before their verses. */
export function compareReferences(a: Reference, b: Reference): number {
  const bookDiff = bookOrder(a.book) - bookOrder(b.book)
  if (bookDiff !== 0) return bookDiff
  const chapterDiff = (a.chapter ?? 0) - (b.chapter ?? 0)
  if (chapterDiff !== 0) return chapterDiff
  return (a.verse ?? 0) - (b.verse ?? 0)
}

function bookOrder(id: string): number {
  const index = bookIndex(id)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
