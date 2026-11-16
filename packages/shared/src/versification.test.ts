import { describe, expect, it } from 'vitest'
import { BOOKS } from './books.js'
import type { ScriptureRef } from './scripture-href.js'
import type { ChapterVerses, VerseUnit } from './scripture-resolve.js'
import { translationInfo } from './translation-info.js'
import {
  CANONICAL,
  chapterLimit,
  mapRange,
  numberingOf,
  schemeChapterCount,
  sourceRange,
  targetUnits,
  unionRange,
  verseCount,
} from './versification.js'

const ref = (book: string, chapter: number, verse?: number, endVerse?: number, endChapter?: number): ScriptureRef => {
  const r: ScriptureRef = { book, chapter }
  if (verse !== undefined) r.verse = verse
  if (endVerse !== undefined) r.endVerse = endVerse
  if (endChapter !== undefined) r.endChapter = endChapter
  return r
}

/** Slices as [chapter, start, end, kind] — easy to read in a table. */
const map = (r: ScriptureRef, from: string, to: string) =>
  mapRange(r, from, to).map((s) => [s.chapter, s.startVerse, s.endVerse, s.kind])

/** A chapter of verse units: numbers 1..n, with bridges as [first, last]. */
function chapter(book: string, c: number, n: number, bridges: [number, number][] = [], missing: number[] = []): ChapterVerses {
  const verses: VerseUnit[] = []
  for (let v = 1; v <= n; v++) {
    if (missing.includes(v)) continue
    const b = bridges.find(([a]) => a === v)
    if (b) {
      verses.push({ verse: v, label: `${b[0]}–${b[1]}` })
      v = b[1]
    } else verses.push({ verse: v })
  }
  return { book, chapter: c, verses }
}

describe('translation versification', () => {
  it('BPH is original, the English Bibles English, unknown English', () => {
    expect(translationInfo('BPH')?.versification).toBe('org')
    for (const t of ['NIV', 'NKJV', 'WEB']) expect(translationInfo(t)?.versification).toBe('eng')
    expect(numberingOf('XYZ')).toEqual({ scheme: 'eng', overrides: [] })
    expect(numberingOf('bph').scheme).toBe('org')
  })

  it('chapter counts: BPH has Joel 4 and no Malachi 4', () => {
    expect(schemeChapterCount('JOL', 'org')).toBe(4)
    expect(schemeChapterCount('MAL', 'org')).toBe(3)
    expect(chapterLimit('JOL', 'org')).toBe(4)
    expect(chapterLimit('MAL', 'org')).toBe(4)
    expect(chapterLimit('JOL', 'eng')).toBe(3)
    // English counts are the canon's (books.ts)
    for (const b of BOOKS) expect(schemeChapterCount(b.id, 'eng'), b.id).toBe(b.chapters)
    // Only Joel and Malachi differ in chapter count
    const differ = BOOKS.filter((b) => schemeChapterCount(b.id, 'org') !== b.chapters).map((b) => b.id)
    expect(differ).toEqual(['JOL', 'MAL'])
  })
})

describe('mapRange: English ↔ original, both directions (#166 table)', () => {
  const cases: [string, ScriptureRef, ScriptureRef, string][] = [
    ['Ps 51:1 ↔ 51:3', ref('PSA', 51, 1), ref('PSA', 51, 3), 'renumbered'],
    ['Ps 3:1 ↔ 3:2', ref('PSA', 3, 1), ref('PSA', 3, 2), 'renumbered'],
    ['Mal 4:1–6 ↔ 3:19–24', ref('MAL', 4, 1, 6), ref('MAL', 3, 19, 24), 'renumbered'],
    ['Joel 2:28–32 ↔ 3:1–5', ref('JOL', 2, 28, 32), ref('JOL', 3, 1, 5), 'renumbered'],
    ['Joel 3 ↔ 4', ref('JOL', 3, 1, 21), ref('JOL', 4, 1, 21), 'renumbered'],
    ['Jonah 1:17 ↔ 2:1', ref('JON', 1, 17), ref('JON', 2, 1), 'renumbered'],
    ['Isa 9:1 ↔ 8:23', ref('ISA', 9, 1), ref('ISA', 8, 23), 'renumbered'],
    ['Dan 5:31 ↔ 6:1', ref('DAN', 5, 31), ref('DAN', 6, 1), 'renumbered'],
    ['Exod 8:1–4 ↔ 7:26–29', ref('EXO', 8, 1, 4), ref('EXO', 7, 26, 29), 'renumbered'],
    ['Gen 31:55 ↔ 32:1', ref('GEN', 31, 55), ref('GEN', 32, 1), 'renumbered'],
    ['John 3:16 (NT) stays', ref('JHN', 3, 16), ref('JHN', 3, 16), 'same'],
  ]
  const slice = (r: ScriptureRef, kind: string) => [[r.chapter, r.verse, r.endVerse ?? r.verse, kind]]

  for (const [name, eng, org, kind] of cases) {
    it(`${name}: NIV → BPH`, () => expect(map(eng, 'NIV', 'BPH')).toEqual(slice(org, kind)))
    it(`${name}: BPH → NIV`, () => expect(map(org, 'BPH', 'NIV')).toEqual(slice(eng, kind)))
  }

  it('whole chapters: English Mal 4 → BPH Mal 3:19–24; BPH Joel 4 → Joel 3', () => {
    expect(map(ref('MAL', 4), 'NIV', 'BPH')).toEqual([[3, 19, 24, 'renumbered']])
    expect(map(ref('JOL', 4), 'BPH', 'NKJV')).toEqual([[3, 1, 21, 'renumbered']])
    // BPH Mal 3 holds English Mal 3 + 4
    expect(map(ref('MAL', 3), 'BPH', 'WEB')).toEqual([
      [3, 1, 18, 'same'],
      [4, 1, 6, 'renumbered'],
    ])
  })

  it('a range across a chapter seam splits into slices', () => {
    expect(map(ref('JOL', 2, 27, 1, 3), 'NIV', 'BPH')).toEqual([
      [2, 27, 27, 'same'],
      [3, 1, 5, 'renumbered'],
      [4, 1, 1, 'renumbered'],
    ])
    const [first] = mapRange(ref('JOL', 2, 28, 1, 3), 'NIV', 'BPH')
    expect(first.source).toEqual({ chapter: 2, startVerse: 28, endChapter: 2, endVerse: 32 })
  })

  it('English never lands on a chapter that does not exist (no BPH Mal 4)', () => {
    for (const s of mapRange(ref('MAL', 4), 'NKJV', 'BPH')) expect(s.chapter).toBe(3)
  })

  it('between English Bibles everything is the same', () => {
    expect(map(ref('PSA', 51, 1, 19), 'NIV', 'NKJV')).toEqual([[51, 1, 19, 'same']])
    expect(map(ref('MAL', 4), 'NKJV', 'NIV')).toEqual([[4, 1, 6, 'same']])
  })

  it('canonical refs (notes, #163) map like English', () => {
    expect(map(ref('MAL', 4, 2), 'NIV', 'BPH')).toEqual([[3, 20, 20, 'renumbered']])
    expect(mapRange(ref('MAL', 4, 2), CANONICAL, 'BPH')).toEqual(mapRange(ref('MAL', 4, 2), 'NIV', 'BPH'))
  })
})

describe('psalm titles', () => {
  it('BPH Ps 51:1–2 (the title) → English = psalmTitle, never absent', () => {
    expect(map(ref('PSA', 51, 1, 2), 'BPH', 'NIV')).toEqual([[51, 0, 0, 'psalmTitle']])
    const [s] = mapRange(ref('PSA', 51, 1, 2), 'BPH', 'NIV')
    expect(targetUnits(chapter('PSA', 51, 19), s)).toEqual({ kind: 'psalmTitle' })
  })

  it('BPH Ps 3:1 (one-verse title) → psalmTitle; 3:2 → 3:1', () => {
    expect(map(ref('PSA', 3, 1, 2), 'BPH', 'WEB')).toEqual([
      [3, 0, 0, 'psalmTitle'],
      [3, 1, 1, 'renumbered'],
    ])
  })

  it('a whole English psalm leaves the BPH title out', () => {
    expect(map(ref('PSA', 51), 'NIV', 'BPH')).toEqual([[51, 3, 21, 'renumbered']])
  })
})

describe('absent and moved verses', () => {
  it('Acts 8:37: maps to itself; absent in NIV/WEB/BPH text, with neighbours', () => {
    const [s] = mapRange(ref('ACT', 8, 37), 'NKJV', 'NIV')
    expect(s).toMatchObject({ chapter: 8, startVerse: 37, endVerse: 37, kind: 'same' })
    const niv = chapter('ACT', 8, 40, [], [37])
    expect(targetUnits(niv, s)).toEqual({ kind: 'absent', absent: [37], before: 36, after: 38 })
    const [b] = mapRange(ref('ACT', 8, 37), 'NKJV', 'BPH')
    expect(targetUnits(niv, b)).toMatchObject({ kind: 'absent', absent: [37] })
  })

  it('Rom 16:24 absent in NIV and BPH, present in NKJV and WEB', () => {
    const [s] = mapRange(ref('ROM', 16, 23, 24), 'NKJV', 'NIV')
    expect(targetUnits(chapter('ROM', 16, 27, [], [24]), s)).toMatchObject({
      kind: 'text',
      startVerse: 23,
      endVerse: 23,
      absent: [24],
    })
    const [w] = mapRange(ref('ROM', 16, 24), 'NKJV', 'WEB')
    expect(targetUnits(chapter('ROM', 16, 24), w)).toMatchObject({ kind: 'text', absent: [] })
  })

  it('WEB Rom 16:25–27 sits at 14:24–26 (moved), both directions', () => {
    expect(map(ref('ROM', 16, 25, 27), 'NIV', 'WEB')).toEqual([[14, 24, 26, 'moved']])
    expect(map(ref('ROM', 14, 24, 26), 'WEB', 'NIV')).toEqual([[16, 25, 27, 'moved']])
    expect(map(ref('ROM', 14, 24, 26), 'WEB', 'BPH')).toEqual([[16, 25, 27, 'moved']])
    expect(map(ref('ROM', 14, 23), 'NIV', 'WEB')).toEqual([[14, 23, 23, 'same']])
  })

  it('WEB chapter counts follow the move', () => {
    expect(verseCount('ROM', 14, 'WEB')).toBe(26)
    expect(verseCount('ROM', 16, 'WEB')).toBe(24)
    expect(verseCount('ROM', 16, 'NIV')).toBe(27)
    expect(map(ref('ROM', 16), 'WEB', 'NIV')).toEqual([[16, 1, 24, 'same']])
  })

  it('a verse one tradition lacks is unmapped, never a neighbour (eng Neh 7:68)', () => {
    expect(map(ref('NEH', 7, 68), 'NIV', 'BPH')).toEqual([[7, 68, 68, 'unmapped']])
    expect(targetUnits(chapter('NEH', 7, 72), mapRange(ref('NEH', 7, 68), 'NIV', 'BPH')[0])).toEqual({
      kind: 'unmapped',
    })
  })

  it('a split verse maps to the verse that holds it (eng Isa 64:1 = Hebrew 63:19b)', () => {
    expect(map(ref('ISA', 64, 1, 2), 'NIV', 'BPH')).toEqual([
      [63, 19, 19, 'renumbered'],
      [64, 1, 1, 'renumbered'],
    ])
    expect(map(ref('1SA', 20, 42), 'BPH', 'NIV')).toEqual([[20, 42, 42, 'same']])
  })

  it('a 404 chapter is unmapped', () => {
    const [s] = mapRange(ref('JOL', 3, 1), 'NIV', 'BPH')
    expect(targetUnits(null, s)).toEqual({ kind: 'unmapped' })
  })
})

describe('bridges', () => {
  const bphJhn3 = chapter('JHN', 3, 36, [[14, 15]])
  const nivJhn3 = chapter('JHN', 3, 36)

  it('sourceRange: BPH 3:15 → the whole bridge 3:14–15', () => {
    // A selection inside the bridge is stored under 14
    expect(sourceRange(bphJhn3, { book: 'JHN', chapter: 3, startVerse: 14, endVerse: 14 })).toEqual({
      ref: ref('JHN', 3, 14, 15),
      bridged: true,
      partial: false,
    })
  })

  it('sourceRange: partial = the selection cut a verse', () => {
    const withText = {
      book: 'JHN',
      chapter: 3,
      verses: [{ verse: 16, text: 'For God so loved the world' }],
    }
    const a = { book: 'JHN', chapter: 3, startVerse: 16, endVerse: 16 }
    expect(sourceRange(withText, { ...a, startWord: 0, endWord: 5 }).partial).toBe(false)
    expect(sourceRange(withText, { ...a, startWord: 1, endWord: 5 }).partial).toBe(true)
    expect(sourceRange(withText, { ...a, startWord: 0, endWord: 3 }).partial).toBe(true)
  })

  it('NIV 3:15 → BPH shows the bridge 14–15 (bridged)', () => {
    const [s] = mapRange(ref('JHN', 3, 15), 'NIV', 'BPH')
    expect(targetUnits(bphJhn3, s)).toEqual({
      kind: 'text',
      startVerse: 14,
      endVerse: 14,
      printedStart: 14,
      printedEnd: 15,
      bridged: true,
      absent: [],
    })
  })

  it('BPH 3:14–15 → NIV shows 14 and 15', () => {
    const [s] = mapRange(ref('JHN', 3, 14, 15), 'BPH', 'NIV')
    expect(targetUnits(nivJhn3, s)).toMatchObject({ kind: 'text', startVerse: 14, endVerse: 15, bridged: false })
  })

  it('unionRange: NIV 3:15 with BPH ticked → 3:14–15 everywhere', () => {
    const u = unionRange(ref('JHN', 3, 15), 'NIV', [
      { numbering: 'BPH', chapters: [bphJhn3] },
      { numbering: 'WEB', chapters: [nivJhn3] },
    ])
    expect(u).toEqual({ ref: ref('JHN', 3, 14, 15), widened: true })
  })

  it('unionRange: BPH 3:14–15 already whole → unchanged', () => {
    const u = unionRange(ref('JHN', 3, 14, 15), 'BPH', [{ numbering: 'NIV', chapters: [nivJhn3] }], [bphJhn3])
    expect(u).toEqual({ ref: ref('JHN', 3, 14, 15), widened: false })
  })

  it('unionRange: widens through a renumbered bridge (BPH Ps 51:1–2 title is not widened into)', () => {
    const bph51 = chapter('PSA', 51, 21, [[1, 2]])
    const u = unionRange(ref('PSA', 51, 1), 'NIV', [{ numbering: 'BPH', chapters: [bph51] }])
    expect(u).toEqual({ ref: ref('PSA', 51, 1), widened: false })
  })

  it('unionRange: a source bridge widens too', () => {
    const u = unionRange(ref('JHN', 3, 15), 'BPH', [], [bphJhn3])
    expect(u.ref).toEqual(ref('JHN', 3, 14, 15))
  })
})

/** Every verse of a book in a scheme, as [chapter, verse]. */
function* versesOf(book: string, scheme: 'eng' | 'org'): Generator<[number, number]> {
  const n = { scheme, overrides: [] }
  for (let c = 1; c <= schemeChapterCount(book, scheme); c++) {
    for (let v = 1; v <= verseCount(book, c, n); v++) yield [c, v]
  }
}

describe('round trip eng → org → eng', () => {
  it('gives back every English verse that has an original counterpart', () => {
    const unmapped: string[] = []
    const broken: string[] = []
    for (const b of BOOKS) {
      for (const [c, v] of versesOf(b.id, 'eng')) {
        const [there] = mapRange(ref(b.id, c, v), 'NIV', 'BPH')
        if (there.kind === 'unmapped') {
          unmapped.push(`${b.id} ${c}:${v}`)
          continue
        }
        const back = mapRange(ref(b.id, there.chapter, there.startVerse, there.endVerse), 'BPH', 'NIV')
        const ok = back.length === 1 && back[0].chapter === c && back[0].startVerse <= v && back[0].endVerse >= v
        if (!ok) broken.push(`${b.id} ${c}:${v}`)
      }
    }
    // Split verses (SPLITS) land on the verse that holds them, which maps
    // back to its own first counterpart
    expect(broken).toEqual(['PSA 13:6', 'ISA 64:1'])
    // Neh 7:68 is absent from the Hebrew text: no counterpart
    expect(unmapped).toEqual(['NEH 7:68'])
  })

  it('and every original verse back again (titles go to verse 0 and back)', () => {
    const broken: string[] = []
    for (const b of BOOKS) {
      for (const [c, v] of versesOf(b.id, 'org')) {
        const [there] = mapRange(ref(b.id, c, v), 'BPH', 'NIV')
        if (there.kind === 'unmapped') {
          broken.push(`${b.id} ${c}:${v} unmapped`)
          continue
        }
        const back = mapRange(ref(b.id, there.chapter, there.startVerse, there.endVerse), 'NIV', 'BPH')
        const ok = back.length === 1 && back[0].chapter === c && back[0].startVerse <= v && back[0].endVerse >= v
        if (!ok) broken.push(`${b.id} ${c}:${v}`)
      }
    }
    expect(broken).toEqual(['1SA 20:42', '1KI 22:43', '1CH 12:4'])
  })
})
