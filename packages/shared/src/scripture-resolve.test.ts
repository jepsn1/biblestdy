import { describe, expect, it } from 'vitest'
import { parseScriptureHref } from './scripture-href.js'
import { resolveInChapter, targetVerses, type ChapterVerses } from './scripture-resolve.js'

const ref = (href: string) => parseScriptureHref(href)!

/** Verse numbers only — no scripture text in fixtures. */
function chapter(book: string, n: number, last: number, bridges: Record<number, number> = {}): ChapterVerses {
  const verses = []
  for (let v = 1; v <= last; v++) {
    const end = bridges[v]
    verses.push(end ? { verse: v, label: `${v}–${end}` } : { verse: v })
    if (end) v = end
  }
  return { book, chapter: n, verses }
}

// BPH-like John 3: 14–15 is one unit stored under 14
const bphJohn3 = chapter('JHN', 3, 36, { 14: 15 })
const webJohn3 = chapter('JHN', 3, 36)

describe('resolveInChapter', () => {
  it('resolves a plain verse and range', () => {
    expect(resolveInChapter(ref('bible:JHN.3.16'), webJohn3)).toEqual({
      startVerse: 16,
      endVerse: 16,
      printedStart: 16,
      printedEnd: 16,
      bridged: false,
      clamped: false,
    })
    expect(resolveInChapter(ref('bible:JHN.3.14-15'), webJohn3)).toMatchObject({ startVerse: 14, endVerse: 15, bridged: false })
  })

  it('a verse inside a bridge resolves to the whole bridge (BPH John 3:15 → 14–15)', () => {
    expect(resolveInChapter(ref('bible:JHN.3.15'), bphJohn3)).toEqual({
      startVerse: 14,
      endVerse: 14,
      printedStart: 14,
      printedEnd: 15,
      bridged: true,
      clamped: false,
    })
    expect(resolveInChapter(ref('bible:JHN.3.14'), bphJohn3)).toMatchObject({ startVerse: 14, printedEnd: 15, bridged: true })
  })

  it('the exact bridge is not "bridged"', () => {
    expect(resolveInChapter(ref('bible:JHN.3.14-15'), bphJohn3)).toMatchObject({
      startVerse: 14,
      endVerse: 14,
      bridged: false,
    })
  })

  it('a range ending inside a bridge widens to its end', () => {
    expect(resolveInChapter(ref('bible:JHN.3.12-14'), bphJohn3)).toMatchObject({
      startVerse: 12,
      endVerse: 14,
      printedStart: 12,
      printedEnd: 15,
      bridged: true,
    })
    // …and one starting inside it widens back to its start
    expect(resolveInChapter(ref('bible:JHN.3.15-17'), bphJohn3)).toMatchObject({
      startVerse: 14,
      endVerse: 17,
      printedStart: 14,
      bridged: true,
    })
  })

  it('a range end past the last verse clamps', () => {
    expect(resolveInChapter(ref('bible:JHN.3.35-40'), webJohn3)).toMatchObject({
      startVerse: 35,
      endVerse: 36,
      clamped: true,
    })
  })

  it('verses wholly past the end are not in this translation — never the nearest verse', () => {
    expect(resolveInChapter(ref('bible:JHN.3.40'), webJohn3)).toBe('notInTranslation')
    // Danish Malachi 3 runs to 24, English to 18: Mal 3:19 typed in an English Bible
    expect(resolveInChapter(ref('bible:MAL.3.19'), chapter('MAL', 3, 18))).toBe('notInTranslation')
  })

  it('a verse in a numbering gap is not in this translation; a range across it is', () => {
    // e.g. a translation omitting Acts 8:37
    const acts8 = { book: 'ACT', chapter: 8, verses: [35, 36, 38, 39].map((verse) => ({ verse })) }
    expect(resolveInChapter(ref('bible:ACT.8.37'), acts8)).toBe('notInTranslation')
    expect(resolveInChapter(ref('bible:ACT.8.36-38'), acts8)).toMatchObject({ startVerse: 36, endVerse: 38, bridged: false })
  })

  it('a missing chapter (404, e.g. BPH Malachi 4) is not in this translation', () => {
    expect(resolveInChapter(ref('bible:MAL.4.5'), null)).toBe('notInTranslation')
    expect(resolveInChapter(ref('bible:MAL.4'), undefined)).toBe('notInTranslation')
    expect(resolveInChapter(ref('bible:MAL.4'), { book: 'MAL', chapter: 4, verses: [] })).toBe('notInTranslation')
  })

  it('a whole chapter covers every unit', () => {
    expect(resolveInChapter(ref('bible:JHN.3'), bphJohn3)).toMatchObject({
      startVerse: 1,
      endVerse: 36,
      bridged: false,
      clamped: false,
    })
  })

  it('cross-chapter ranges cover the rest of the first chapter and the start of the last', () => {
    const r = ref('bible:ROM.8.28-9.5')
    expect(resolveInChapter(r, chapter('ROM', 8, 39))).toMatchObject({ startVerse: 28, endVerse: 39, clamped: false })
    expect(resolveInChapter(r, chapter('ROM', 9, 33))).toMatchObject({ startVerse: 1, endVerse: 5 })
    // A middle chapter is covered whole
    expect(resolveInChapter(ref('bible:ISA.51.1-53.12'), chapter('ISA', 52, 15))).toMatchObject({
      startVerse: 1,
      endVerse: 15,
    })
  })

  it('a reference elsewhere does not touch the chapter', () => {
    expect(resolveInChapter(ref('bible:ROM.8.28-9.5'), chapter('ROM', 10, 21))).toBeNull()
    expect(resolveInChapter(ref('bible:JHN.3.16'), chapter('JHN', 4, 54))).toBeNull()
  })
})

describe('targetVerses (moved from the reader, behaviour unchanged)', () => {
  it('lands inside a bridge on the bridge and clamps past the end', () => {
    expect(targetVerses([13, 14, 16], { start: 15, end: 15 })).toEqual({ start: 14, end: 14 })
    expect(targetVerses([1, 2, 3], { start: 2, end: Infinity })).toEqual({ start: 2, end: 3 })
    expect(targetVerses([], { start: 1, end: 1 })).toBeNull()
  })
})
