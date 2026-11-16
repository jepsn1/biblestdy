import { describe, expect, it } from 'vitest'
import { parseScriptureHref, type ScriptureRef } from './scripture-href.js'
import type { ChapterVerses, VerseUnit } from './scripture-resolve.js'
import { canonicalRef, localRef, refTouchesChapterIn, resolveMapped } from './versification.js'

const ref = (href: string): ScriptureRef => parseScriptureHref(href)!
const bph = (r: ScriptureRef) => localRef(r, 'BPH')

function chapter(book: string, c: number, n: number, bridges: [number, number][] = []): ChapterVerses {
  const verses: VerseUnit[] = []
  for (let v = 1; v <= n; v++) {
    const b = bridges.find(([a]) => a === v)
    if (b) {
      verses.push({ verse: v, label: `${b[0]}–${b[1]}` })
      v = b[1]
    } else verses.push({ verse: v })
  }
  return { book, chapter: c, verses }
}

describe('localRef: stored (English) refs in BPH numbering (#163)', () => {
  it('Malachi 4 is BPH Malachi 3,19–24', () => {
    expect(bph(ref('bible:MAL.4.5'))).toEqual({ ref: { book: 'MAL', chapter: 3, verse: 23 }, renumbered: true })
    expect(bph(ref('bible:MAL.4.2'))?.ref).toEqual({ book: 'MAL', chapter: 3, verse: 20 })
    expect(bph(ref('bible:MAL.4.1-6'))?.ref).toEqual({ book: 'MAL', chapter: 3, verse: 19, endVerse: 24 })
    expect(bph(ref('bible:MAL.4'))?.ref).toEqual({ book: 'MAL', chapter: 3, verse: 19, endVerse: 24 })
    // English Mal 3 is the same in BPH: the ref itself
    const m3 = ref('bible:MAL.3.1')
    expect(bph(m3)).toEqual({ ref: m3, renumbered: false })
  })

  it('Joel 2:28–32 is BPH Joel 3, Joel 3 is Joel 4', () => {
    expect(bph(ref('bible:JOL.2.28'))?.ref).toEqual({ book: 'JOL', chapter: 3, verse: 1 })
    expect(bph(ref('bible:JOL.2.28-32'))?.ref).toEqual({ book: 'JOL', chapter: 3, verse: 1, endVerse: 5 })
    expect(bph(ref('bible:JOL.3.1'))?.ref).toEqual({ book: 'JOL', chapter: 4, verse: 1 })
    // Across the seam: one span over both BPH chapters
    expect(bph(ref('bible:JOL.2.27-28'))?.ref).toEqual({ book: 'JOL', chapter: 2, verse: 27, endChapter: 3, endVerse: 1 })
    expect(bph(ref('bible:JOL.2'))?.ref).toEqual({ book: 'JOL', chapter: 2, verse: 1, endChapter: 3, endVerse: 5 })
  })

  it('psalm titles: English 51:1 is BPH 51,3; a whole psalm stays whole', () => {
    expect(bph(ref('bible:PSA.51.1'))).toEqual({ ref: { book: 'PSA', chapter: 51, verse: 3 }, renumbered: true })
    const ps51 = ref('bible:PSA.51')
    expect(bph(ps51)).toEqual({ ref: ps51, renumbered: false })
    // A psalm without a numbered title keeps its numbers
    expect(bph(ref('bible:PSA.1.1'))?.renumbered).toBe(false)
  })

  it('no counterpart → null, never the same number', () => {
    expect(bph(ref('bible:NEH.7.68'))).toBeNull()
  })

  it('English translations: same, or moved by an override (WEB Rom 16:25 → 14:24)', () => {
    const j = ref('bible:JHN.3.16')
    expect(localRef(j, 'WEB')).toEqual({ ref: j, renumbered: false })
    expect(localRef(ref('bible:ROM.16.25'), 'WEB')).toEqual({ ref: { book: 'ROM', chapter: 14, verse: 24 }, renumbered: true })
    expect(localRef(ref('bible:MAL.4.5'), 'NIV')?.renumbered).toBe(false)
  })
})

describe('canonicalRef: a BPH selection → the href to store', () => {
  it('both directions round-trip', () => {
    expect(canonicalRef({ book: 'MAL', chapter: 3, verse: 23 }, 'BPH')).toEqual({ book: 'MAL', chapter: 4, verse: 5 })
    expect(canonicalRef({ book: 'MAL', chapter: 3, verse: 19, endVerse: 24 }, 'BPH')).toEqual({ book: 'MAL', chapter: 4, verse: 1, endVerse: 6 })
    expect(canonicalRef({ book: 'MAL', chapter: 3, verse: 17, endVerse: 20 }, 'BPH')).toEqual({
      book: 'MAL',
      chapter: 3,
      verse: 17,
      endChapter: 4,
      endVerse: 2,
    })
    expect(canonicalRef({ book: 'JOL', chapter: 4, verse: 1 }, 'BPH')).toEqual({ book: 'JOL', chapter: 3, verse: 1 })
    expect(canonicalRef({ book: 'PSA', chapter: 51, verse: 3 }, 'BPH')).toEqual({ book: 'PSA', chapter: 51, verse: 1 })
    expect(canonicalRef({ book: 'JHN', chapter: 3, verse: 16 }, 'WEB')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('a psalm title alone has no English verse; with verses it keeps the verses', () => {
    expect(canonicalRef({ book: 'PSA', chapter: 51, verse: 1, endVerse: 2 }, 'BPH')).toBeNull()
    expect(canonicalRef({ book: 'PSA', chapter: 51, verse: 1, endVerse: 4 }, 'BPH')).toEqual({ book: 'PSA', chapter: 51, verse: 1, endVerse: 2 })
  })
})

describe('refTouchesChapterIn / resolveMapped', () => {
  it('a ref to Mal 4 is in BPH Mal 3, not in BPH Mal 4', () => {
    const r = ref('bible:MAL.4.5')
    expect(refTouchesChapterIn(r, 'BPH', 'MAL', 3)).toBe(true)
    expect(refTouchesChapterIn(r, 'BPH', 'MAL', 4)).toBe(false)
    expect(refTouchesChapterIn(r, 'WEB', 'MAL', 4)).toBe(true)
    expect(refTouchesChapterIn(r, 'WEB', 'MAL', 3)).toBe(false)
    // English Joel 2:1 stays in BPH Joel 2; 2:30 goes to Joel 3
    expect(refTouchesChapterIn(ref('bible:JOL.2.1'), 'BPH', 'JOL', 3)).toBe(false)
    expect(refTouchesChapterIn(ref('bible:JOL.2.30'), 'BPH', 'JOL', 3)).toBe(true)
    // Unmapped: by number, so "isn't in BPH" has a chapter to show in
    expect(refTouchesChapterIn(ref('bible:NEH.7.68'), 'BPH', 'NEH', 7)).toBe(true)
    expect(refTouchesChapterIn(r, 'BPH', 'JOL', 3)).toBe(false)
  })

  it('resolves in the loaded BPH chapter, saying it was renumbered', () => {
    const mal3 = chapter('MAL', 3, 24)
    expect(resolveMapped(ref('bible:MAL.4.5'), mal3, 'BPH')).toMatchObject({ startVerse: 23, endVerse: 23, printedStart: 23, renumbered: true })
    expect(resolveMapped(ref('bible:MAL.3.1'), mal3, 'BPH')).toMatchObject({ startVerse: 1, renumbered: false })
    expect(resolveMapped(ref('bible:JOL.3.1'), mal3, 'BPH')).toBeNull()
    expect(resolveMapped(ref('bible:NEH.7.68'), chapter('NEH', 7, 72), 'BPH')).toBe('notInTranslation')
    expect(resolveMapped(ref('bible:MAL.4.5'), null, 'BPH')).toBe('notInTranslation')
    // Bridges still widen after mapping
    expect(resolveMapped(ref('bible:MAL.4.5'), chapter('MAL', 3, 24, [[22, 24]]), 'BPH')).toMatchObject({
      startVerse: 22,
      printedEnd: 24,
      bridged: true,
      renumbered: true,
    })
  })

  it('an anchor in another translation maps between them (WEB Mal 4:5 → BPH)', () => {
    const r = { book: 'MAL', chapter: 4, verse: 5 }
    expect(resolveMapped(r, chapter('MAL', 3, 24), 'BPH', 'WEB')).toMatchObject({ startVerse: 23 })
    expect(resolveMapped({ book: 'MAL', chapter: 3, verse: 23 }, chapter('MAL', 4, 6), 'WEB', 'BPH')).toMatchObject({ startVerse: 5 })
  })
})
