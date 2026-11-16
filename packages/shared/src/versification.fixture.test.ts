/**
 * The map's predictions against the verse numbers the translations really
 * serve (fixtures/verse-numbers.json: numbers + bridges only, no text;
 * made by tools/versification/verse-counts.mjs). Every difference must be a
 * known one, listed below with its reason.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOOKS } from './books.js'
import { mapRange, verseCount } from './versification.js'

interface Fixture {
  translations: Record<string, Record<string, (string | null)[]>>
}
const fixture: Fixture = JSON.parse(readFileSync(new URL('./fixtures/verse-numbers.json', import.meta.url), 'utf8'))
const TRANSLATIONS = ['NIV', 'NKJV', 'WEB', 'BPH'] as const

/** The printed verse numbers a chapter covers ("1-13,14~15,16-36"). */
function covered(chapter: string | null): Set<number> {
  const out = new Set<number>()
  if (!chapter) return out
  for (const token of chapter.split(',')) {
    const [a, b] = token.split(/[-~]/).map(Number)
    for (let v = a; v <= (b ?? a); v++) out.add(v)
  }
  return out
}

const actual = (t: string, book: string, c: number) => covered(fixture.translations[t]?.[book]?.[c - 1] ?? null)

/**
 * Verses a translation lacks although its scheme numbers them — late
 * additions most modern texts leave out (absent in the text; the map still
 * maps them, targetUnits reports `absent`) — and other known gaps.
 */
// Verses most modern critical texts leave out (kept in NKJV's Textus Receptus)
const LATE_ADDITIONS = {
  matt: ['MAT 17:21', 'MAT 18:11', 'MAT 23:14'],
  mark: ['MRK 7:16', 'MRK 9:44', 'MRK 9:46', 'MRK 11:26', 'MRK 15:28'],
  luke: ['LUK 17:36', 'LUK 23:17'],
  john: ['JHN 5:4'],
  acts: ['ACT 8:37', 'ACT 15:34', 'ACT 24:7', 'ACT 28:29'],
  rom: ['ROM 16:24'],
}
const KNOWN_MISSING: Record<string, string[]> = {
  NIV: Object.values(LATE_ADDITIONS).flat(),
  // WEB keeps most of them (Majority Text), not these
  WEB: ['LUK 17:36', 'ACT 8:37', 'ACT 15:34', 'ACT 24:7'],
  // BPH keeps Matt 17:21, Mark 7:16, 11:26 and John 5:4
  BPH: [
    'MAT 18:11',
    'MAT 23:14',
    ...LATE_ADDITIONS.mark.filter((v) => v !== 'MRK 7:16' && v !== 'MRK 11:26'),
    ...LATE_ADDITIONS.luke,
    ...LATE_ADDITIONS.acts,
    ...LATE_ADDITIONS.rom,
  ],
}

/** Verses a translation has beyond its scheme's count. */
const KNOWN_EXTRA: Record<string, string[]> = {
  // WEB carries Psalm 151 (deuterocanonical) in its Psalms
  WEB: [1, 2, 3, 4, 5, 6, 7].map((v) => `PSA 151:${v}`),
}

/** Verses the map has no counterpart for in the target, on purpose. */
const KNOWN_UNMAPPED: Record<string, string[]> = {
  // Neh 7:68 (horses and mules) is absent from the Hebrew text
  BPH: ['NEH 7:68'],
}

describe('verse-number fixture', () => {
  it('covers all 66 books for every translation', () => {
    for (const t of TRANSLATIONS) {
      expect(Object.keys(fixture.translations[t]).sort(), t).toEqual(BOOKS.map((b) => b.id).sort())
    }
  })

  for (const t of TRANSLATIONS) {
    it(`${t}: every chapter has the verses its numbering predicts`, () => {
      const missing: string[] = []
      const extra: string[] = []
      for (const b of BOOKS) {
        const chapters = Math.max(fixture.translations[t][b.id].length, b.chapters + 1)
        for (let c = 1; c <= chapters; c++) {
          const have = actual(t, b.id, c)
          const n = verseCount(b.id, c, t)
          for (let v = 1; v <= n; v++) if (!have.has(v)) missing.push(`${b.id} ${c}:${v}`)
          for (const v of have) if (v > n) extra.push(`${b.id} ${c}:${v}`)
        }
      }
      expect(missing).toEqual(KNOWN_MISSING[t] ?? [])
      expect(extra).toEqual(KNOWN_EXTRA[t] ?? [])
    })
  }

  // The map itself: every verse a translation has lands on a verse the
  // other one has (or on a known gap there, or on a psalm title).
  const pairs = TRANSLATIONS.flatMap((a) => TRANSLATIONS.filter((b) => b !== a).map((b) => [a, b] as const))
  for (const [from, to] of pairs) {
    it(`${from} → ${to}: mapped verses exist in the target`, () => {
      const gaps = new Set(KNOWN_MISSING[to] ?? [])
      const skip = new Set([...(KNOWN_EXTRA[from] ?? []), ...(KNOWN_UNMAPPED[to] ?? [])])
      const misses: string[] = []
      for (const b of BOOKS) {
        const chapters = fixture.translations[from][b.id].length
        for (let c = 1; c <= chapters; c++) {
          for (const v of actual(from, b.id, c)) {
            if (skip.has(`${b.id} ${c}:${v}`)) continue
            for (const s of mapRange({ book: b.id, chapter: c, verse: v }, from, to)) {
              if (s.startVerse === 0) continue // a psalm title
              if (s.kind === 'unmapped') {
                misses.push(`${b.id} ${c}:${v} unmapped`)
                continue
              }
              const have = actual(to, s.book, s.chapter)
              for (let w = s.startVerse; w <= s.endVerse; w++) {
                const id = `${s.book} ${s.chapter}:${w}`
                if (!have.has(w) && !gaps.has(id)) misses.push(`${b.id} ${c}:${v} → ${id}`)
              }
            }
          }
        }
      }
      expect(misses).toEqual([])
    })
  }
})
