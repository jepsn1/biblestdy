/**
 * Versification map (#166): the same verse carries different numbers in
 * different Bibles. BPH numbers the Old Testament the Hebrew ("original")
 * way — Ps 51:1 in English is Salme 51,3 (the title is verse 1–2), English
 * Mal 4 is Mal 3,19–24, Joel 3 is Joel 4 — while NIV, NKJV and WEB number it
 * the English way. Matching by verse number alone shows the wrong verse.
 *
 * English is the pivot: a translation's own numbering → (undo its
 * overrides) → its scheme → English → the target's scheme → (apply its
 * overrides) → the target's own numbering. Pure data + pure functions; no
 * web imports.
 *
 * Import from `@biblestdy/shared/versification` (NOT the package index): the
 * shared package ships CJS, so anything the index re-exports lands in the
 * reader's first-load bundle. Only lazy chunks should pull this in.
 *
 * Pipeline for "show this passage in other translations" (#167):
 *   sourceRange(chapter, anchor)        whole verse units of the selection
 *   unionRange(ref, from, targets)      widen so no bridge is cut anywhere
 *   mapRange(ref, from, to)             → target slices, each with a kind
 *   targetUnits(fetchedChapter, slice)  → the units to show / what's absent
 * Notes (#163): stored refs are canonical (English), so
 *   mapRange(ref, CANONICAL, abbr) → per slice resolveInChapter / targetUnits.
 */
import { ENG_TO_ORG, ENG_VERSES, ORG_VERSES } from './versification-data.js'
import { translationInfo } from './translation-info.js'
import { resolveInChapter, unitEnd, type ChapterVerses, type VerseUnit } from './scripture-resolve.js'
import type { ScriptureRef } from './scripture-href.js'
import { words } from './anchor.js'

/** `eng` = English Bibles (KJV tradition); `org` = original-language
 * numbering (Hebrew OT, as in BHS; Greek NT) — eng.vrs / org.vrs. */
export type Scheme = 'eng' | 'org'

/** A quirk no scheme covers: `from` in the translation's scheme numbering,
 * `to` where this translation prints it. Same-length ranges, one chapter. */
export interface Override {
  from: string
  to: string
}

/** Per-translation quirks, keyed by abbreviation (verified against the
 * verse-number fixture, see versification.test.ts). */
export const VERSIFICATION_OVERRIDES: Readonly<Record<string, readonly Override[]>> = {
  // The doxology sits after Rom 14:23 in WEB (as in the Majority Text)
  WEB: [{ from: 'ROM 16:25-27', to: 'ROM 14:24-26' }],
}

/** How one translation numbers its verses. */
export interface Numbering {
  scheme: Scheme
  overrides: readonly Override[]
}

/** The numbering stored references use (note refs, `bible:` links). */
export const CANONICAL: Numbering = { scheme: 'eng', overrides: [] }

/** A translation's numbering; unknown translations are English. */
export function numberingOf(abbreviation: string): Numbering {
  const abbr = abbreviation.toUpperCase()
  return {
    scheme: translationInfo(abbr)?.versification ?? 'eng',
    overrides: VERSIFICATION_OVERRIDES[abbr] ?? [],
  }
}

/** A translation abbreviation, or a Numbering. */
export type NumberingLike = Numbering | string

const asNumbering = (n: NumberingLike): Numbering => (typeof n === 'string' ? numberingOf(n) : n)

/**
 * What a slice of a mapped range is:
 * - `same`: same chapter and verse numbers;
 * - `renumbered`: another number in this scheme (Ps 51:1 → 51:3);
 * - `moved`: this translation prints it elsewhere (WEB Rom 16:25 → 14:24);
 * - `psalmTitle`: a psalm title, numbered on one side only (BPH Ps 51:1–2
 *   → English verse 0, i.e. the unnumbered title);
 * - `unmapped`: the map has no counterpart (e.g. a verse one tradition
 *   lacks) — say so, never show the same number instead.
 */
export type SliceKind = 'same' | 'renumbered' | 'moved' | 'psalmTitle' | 'unmapped'

/** One piece of a mapped range, in the target's own numbering. Verse 0 =
 * an unnumbered psalm title. `unmapped` keeps the source numbers. */
export interface MappedSlice {
  book: string
  chapter: number
  startVerse: number
  endVerse: number
  kind: SliceKind
  /** The part of the asked range this slice comes from (source numbering). */
  source: { chapter: number; startVerse: number; endChapter: number; endVerse: number }
}

// ---- data (parsed lazily: nothing runs at import time) ----------------

interface Seg {
  book: string
  chapter: number
  start: number
  end: number
}
interface Rule {
  from: Seg
  to: Seg
}
interface RuleSet {
  /** Rules by source chapter "BOOK c". */
  byFrom: Map<string, Rule[]>
  /** Target chapters' verses claimed by a rule: identity can't land there. */
  claimed: Map<string, Seg[]>
  /** Split verses (see SPLITS), tried only where identity is claimed. */
  splits: Map<string, Rule[]>
}

/**
 * Split verses the .vrs files can't express ("no support for splits yet"):
 * one verse on one side holds the end or start of a verse on the other. A
 * verse here maps to the verse that contains it, instead of to nothing.
 * Verse-level only, so these don't round-trip (versification.test.ts).
 */
const SPLITS: { engToOrg: readonly Override[]; orgToEng: readonly Override[] } = {
  engToOrg: [
    // eng Ps 13:5–6 = Hebrew 13:6
    { from: 'PSA 13:6', to: 'PSA 13:6' },
    // eng Isa 64:1 = Hebrew 63:19b
    { from: 'ISA 64:1', to: 'ISA 63:19' },
  ],
  orgToEng: [
    // Hebrew 1 Sam 20:42 = eng 20:42a (20:42b = Hebrew 21:1)
    { from: '1SA 20:42', to: '1SA 20:42' },
    // Hebrew 1 Kgs 22:43 = eng 22:43a (22:43b = Hebrew 22:44)
    { from: '1KI 22:43', to: '1KI 22:43' },
    // Hebrew 1 Chr 12:4 = eng 12:4a (12:4b = Hebrew 12:5)
    { from: '1CH 12:4', to: '1CH 12:4' },
  ],
}

function parseSeg(s: string): Seg {
  const m = /^([1-3A-Z][A-Z0-9]{2}) (\d+):(\d+)(?:-(\d+))?$/.exec(s)
  if (!m) throw new Error(`bad versification segment '${s}'`)
  const start = Number(m[3])
  return { book: m[1], chapter: Number(m[2]), start, end: m[4] ? Number(m[4]) : start }
}

const key = (book: string, chapter: number) => `${book} ${chapter}`

const parseRule = (o: Override): Rule => ({ from: parseSeg(o.from), to: parseSeg(o.to) })

function byChapter(rules: readonly Rule[]): Map<string, Rule[]> {
  const out = new Map<string, Rule[]>()
  for (const r of rules) {
    const k = key(r.from.book, r.from.chapter)
    out.set(k, [...(out.get(k) ?? []), r])
  }
  return out
}

function ruleSet(rules: readonly Rule[], splits: readonly Override[] = []): RuleSet {
  const claimed = new Map<string, Seg[]>()
  for (const r of rules) {
    const t = key(r.to.book, r.to.chapter)
    claimed.set(t, [...(claimed.get(t) ?? []), r.to])
  }
  return { byFrom: byChapter(rules), claimed, splits: byChapter(splits.map(parseRule)) }
}

const flip = (r: Rule): Rule => ({ from: r.to, to: r.from })

let schemeRules: { engToOrg: RuleSet; orgToEng: RuleSet } | undefined
function schemes() {
  if (!schemeRules) {
    const rules = ENG_TO_ORG.map(parseRule)
    schemeRules = {
      engToOrg: ruleSet(rules, SPLITS.engToOrg),
      orgToEng: ruleSet(rules.map(flip), SPLITS.orgToEng),
    }
  }
  return schemeRules
}

const overrideRules = new WeakMap<readonly Override[], { apply: RuleSet; undo: RuleSet }>()
function overridesOf(list: readonly Override[]) {
  let hit = overrideRules.get(list)
  if (!hit) {
    const rules = list.map(parseRule)
    hit = { apply: ruleSet(rules), undo: ruleSet(rules.map(flip)) }
    overrideRules.set(list, hit)
  }
  return hit
}

const countCache = new Map<string, number[]>()
function schemeCounts(book: string, scheme: Scheme): number[] {
  const k = `${scheme} ${book}`
  let counts = countCache.get(k)
  if (!counts) {
    const raw = (scheme === 'org' ? ORG_VERSES[book] : undefined) ?? ENG_VERSES[book]
    counts = raw ? raw.split(' ').map(Number) : []
    countCache.set(k, counts)
  }
  return counts
}

/** Chapters of a book in a scheme (BPH has Joel 4, no Malachi 4). */
export function schemeChapterCount(book: string, scheme: Scheme): number {
  return schemeCounts(book, scheme).length
}

/** The highest chapter the API should try for a book in a scheme: the max
 * of both schemes, so a translation that deviates from its scheme still
 * gets a real 404 rather than a 400 (BPH Mal 4 → 404, Joel 4 → 200). */
export function chapterLimit(book: string, scheme: Scheme): number {
  const eng = schemeChapterCount(book, 'eng')
  return scheme === 'eng' ? eng : Math.max(eng, schemeChapterCount(book, 'org'))
}

/** Verses in a chapter in a translation's own numbering (0 = no such
 * chapter): the scheme's count, minus verses its overrides move out, plus
 * verses they move in. */
export function verseCount(book: string, chapter: number, numbering: NumberingLike): number {
  const n = asNumbering(numbering)
  let count = schemeCounts(book, n.scheme)[chapter - 1] ?? 0
  const moved = n.overrides.map(parseRule)
  const away = moved.filter((m) => m.from.book === book && m.from.chapter === chapter)
  // A block moved off the chapter's end shortens it (WEB Rom 16 ends at 24)
  for (const m of away.sort((a, b) => b.from.end - a.from.end)) {
    if (m.from.end >= count && m.from.start <= count) count = m.from.start - 1
  }
  for (const m of moved) {
    if (m.to.book === book && m.to.chapter === chapter) count = Math.max(count, m.to.end)
  }
  return count
}

// ---- mapping one verse --------------------------------------------------

interface Point {
  chapter: number
  start: number
  end: number
}
type Step = { point: Point; hit: boolean } | 'unmapped'

function through(rules: Rule[] | undefined, verse: number): Point | null {
  for (const r of rules ?? []) {
    if (verse < r.from.start || verse > r.from.end) continue
    const sameLength = r.from.end - r.from.start === r.to.end - r.to.start
    const at = r.to.start + verse - r.from.start
    return sameLength
      ? { chapter: r.to.chapter, start: at, end: at }
      : { chapter: r.to.chapter, start: r.to.start, end: r.to.end }
  }
  return null
}

/** One verse through one rule set: a rule wins; otherwise the same number,
 * unless a rule claims that number on the other side (two verses can't
 * share it: eng Neh 7:68 has no verse in org) and no split covers it. */
function step(rules: RuleSet, book: string, chapter: number, verse: number): Step {
  const k = key(book, chapter)
  const ruled = through(rules.byFrom.get(k), verse)
  if (ruled) return { point: ruled, hit: true }
  const taken = (rules.claimed.get(k) ?? []).some((s) => verse >= s.start && verse <= s.end)
  if (!taken) return { point: { chapter, start: verse, end: verse }, hit: false }
  const split = through(rules.splits.get(k), verse)
  return split ? { point: split, hit: true } : 'unmapped'
}

/** A point (possibly a range from an n:m title rule) through a rule set. */
function stepPoint(rules: RuleSet, book: string, p: Point): { point: Point; hit: boolean } | 'unmapped' {
  const a = step(rules, book, p.chapter, p.start)
  if (p.start === p.end || a === 'unmapped') return a
  const b = step(rules, book, p.chapter, p.end)
  if (b === 'unmapped' || b.point.chapter !== a.point.chapter) return 'unmapped'
  return {
    point: { chapter: a.point.chapter, start: Math.min(a.point.start, b.point.start), end: Math.max(a.point.end, b.point.end) },
    hit: a.hit || b.hit,
  }
}

function mapVerse(
  book: string,
  chapter: number,
  verse: number,
  from: Numbering,
  to: Numbering,
): { point: Point; kind: SliceKind } {
  const unmapped = { point: { chapter, start: verse, end: verse }, kind: 'unmapped' as const }
  if (from.scheme === to.scheme && from.overrides === to.overrides) {
    return { point: { chapter, start: verse, end: verse }, kind: 'same' }
  }
  const { engToOrg, orgToEng } = schemes()
  const steps: RuleSet[] = []
  const movedSteps = new Set<RuleSet>()
  const add = (r: RuleSet, moved = false) => {
    steps.push(r)
    if (moved) movedSteps.add(r)
  }
  if (from.overrides.length > 0) add(overridesOf(from.overrides).undo, true)
  if (from.scheme !== to.scheme) add(from.scheme === 'org' ? orgToEng : engToOrg)
  if (to.overrides.length > 0) add(overridesOf(to.overrides).apply, true)

  let p: Point = { chapter, start: verse, end: verse }
  let moved = false
  let title = verse === 0
  for (const rules of steps) {
    const r = stepPoint(rules, book, p)
    if (r === 'unmapped') return unmapped
    p = r.point
    if (r.hit && movedSteps.has(rules)) moved = true
    if (p.start === 0) title = true
  }
  // An n:m rule only ever comes from a psalm title (eng verse 0 ↔ 1–2)
  if (title || p.start !== p.end) return { point: p, kind: 'psalmTitle' }
  if (moved) return { point: p, kind: 'moved' }
  return { point: p, kind: p.chapter === chapter && p.start === verse ? 'same' : 'renumbered' }
}

// ---- ranges ---------------------------------------------------------------

/**
 * Maps a reference (in `from`'s own numbering) to `to`'s own numbering, as
 * the slices it falls into, in source order. A slice never crosses a
 * chapter; a range can map onto several (Joel 2:28–3:1 → 3:1–4:1).
 * A whole-chapter ref covers the chapter's verses in `from`'s numbering.
 * `from`/`to`: a translation abbreviation (see numberingOf) or a Numbering.
 */
export function mapRange(range: ScriptureRef, from: NumberingLike, to: NumberingLike): MappedSlice[] {
  const src = asNumbering(from)
  const dst = asNumbering(to)
  const lastChapter = range.endChapter ?? range.chapter
  const out: MappedSlice[] = []
  for (let c = range.chapter; c <= lastChapter; c++) {
    const count = verseCount(range.book, c, src)
    const start = c === range.chapter ? (range.verse ?? 1) : 1
    let end: number
    if (c === lastChapter && range.verse !== undefined) end = range.endVerse ?? range.verse
    else end = count
    // No such chapter in this numbering: one probe verse says so
    end = Math.max(start, Math.min(end, Math.max(count, start)))
    for (let v = start; v <= end; v++) {
      const { point, kind } = mapVerse(range.book, c, v, src, dst)
      const prev = out[out.length - 1]
      const joins =
        prev &&
        prev.kind === kind &&
        prev.chapter === point.chapter &&
        point.start >= prev.startVerse &&
        point.start <= prev.endVerse + 1
      if (joins) {
        prev.endVerse = Math.max(prev.endVerse, point.end)
        prev.source.endChapter = c
        prev.source.endVerse = v
      } else {
        out.push({
          book: range.book,
          chapter: point.chapter,
          startVerse: point.start,
          endVerse: point.end,
          kind,
          source: { chapter: c, startVerse: v, endChapter: c, endVerse: v },
        })
      }
    }
  }
  return out
}

/** A selection: stored verse numbers (+ word offsets when known). */
export interface SourceAnchor {
  book: string
  chapter: number
  startVerse: number
  endVerse: number
  startWord?: number
  endWord?: number
}

/** A loaded chapter as `sourceRange` reads it (Chapter is one). */
export interface ChapterWithText {
  book: string
  chapter: number
  verses: readonly (VerseUnit & { text?: string })[]
}

/**
 * The anchor as whole verse units in its own chapter: a selection inside a
 * bridge (BPH John 3:15, stored under 14 as "14–15") covers the bridge.
 * `ref` uses printed numbers (14–15); `partial` = the selection didn't cover
 * its first and last verse whole ("Whole verses are shown").
 */
export function sourceRange(
  chapter: ChapterWithText,
  anchor: SourceAnchor,
): { ref: ScriptureRef; bridged: boolean; partial: boolean } {
  const asked: ScriptureRef = { book: anchor.book, chapter: anchor.chapter, verse: anchor.startVerse }
  if (anchor.endVerse > anchor.startVerse) asked.endVerse = anchor.endVerse
  const r = resolveInChapter(asked, chapter)
  const ref: ScriptureRef = { book: anchor.book, chapter: anchor.chapter }
  let bridged = false
  if (r && r !== 'notInTranslation') {
    ref.verse = r.printedStart
    if (r.printedEnd > r.printedStart) ref.endVerse = r.printedEnd
    bridged = r.bridged
  } else {
    ref.verse = asked.verse
    if (asked.endVerse !== undefined) ref.endVerse = asked.endVerse
  }
  const last = chapter.verses.find((v) => v.verse === anchor.endVerse)
  const lastWords = last?.text !== undefined ? words(last.text).length : undefined
  const partial =
    (anchor.startWord ?? 0) > 0 ||
    (anchor.endWord !== undefined && lastWords !== undefined && anchor.endWord < lastWords - 1)
  return { ref, bridged, partial }
}

/** What a mapped slice shows in the fetched target chapter. */
export type TargetUnits =
  | {
      kind: 'text'
      /** Stored numbers of the first/last unit to show (Verse.verse). */
      startVerse: number
      endVerse: number
      /** Printed numbers those units span (a bridge can widen them). */
      printedStart: number
      printedEnd: number
      bridged: boolean
      /** Numbers inside the slice this text doesn't have (NIV Acts 8:37). */
      absent: number[]
    }
  /** None of the slice's verses are in this text; `before`/`after` = the
   * neighbouring units (stored numbers) so the gap can be shown in place. */
  | { kind: 'absent'; absent: number[]; before?: number; after?: number }
  /** An unnumbered psalm title: this translation has no verse for it. */
  | { kind: 'psalmTitle' }
  /** The map has no counterpart, or the chapter doesn't exist (404). */
  | { kind: 'unmapped' }

/**
 * The whole units of a fetched target chapter that a slice covers.
 * `chapter` null/undefined = the chapter 404'd. Absence is decided here,
 * from the text — never stored in the map.
 */
export function targetUnits(chapter: ChapterVerses | null | undefined, slice: MappedSlice): TargetUnits {
  if (slice.kind === 'unmapped' || !chapter) return { kind: 'unmapped' }
  if (slice.startVerse === 0) return { kind: 'psalmTitle' }
  const units = [...chapter.verses].sort((a, b) => a.verse - b.verse)
  const { startVerse: s, endVerse: e } = slice
  const hit = units.filter((u) => u.verse <= e && unitEnd(u) >= s)
  const absent: number[] = []
  for (let v = s; v <= e; v++) {
    if (!hit.some((u) => v >= u.verse && v <= unitEnd(u))) absent.push(v)
  }
  if (hit.length === 0) {
    const before = units.filter((u) => u.verse < s).pop()?.verse
    const after = units.find((u) => u.verse > e)?.verse
    return {
      kind: 'absent',
      absent,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
    }
  }
  const first = hit[0]
  const last = hit[hit.length - 1]
  const printedEnd = unitEnd(last)
  return {
    kind: 'text',
    startVerse: first.verse,
    endVerse: last.verse,
    printedStart: first.verse,
    printedEnd,
    bridged: first.verse < s || printedEnd > e,
    absent,
  }
}

/** Another translation in the comparison, with whatever chapters of it are
 * loaded (chapters not loaded yet just don't widen anything). */
export interface UnionTarget {
  numbering: NumberingLike
  chapters: readonly ChapterVerses[]
}

type Pos = [chapter: number, verse: number]
const before = (a: Pos, b: Pos) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

/**
 * Widens `range` (in `from`'s own numbering) until a bridge in any of the
 * given translations is covered whole in every one: NIV John 3:15 with BPH
 * ticked → 3:14–15 everywhere, because BPH prints 14–15 as one unit.
 * `sourceChapters` (the reading translation's loaded chapters) widen by its
 * own bridges too. Returns the widened ref; `widened` = it grew.
 */
export function unionRange(
  range: ScriptureRef,
  from: NumberingLike,
  targets: readonly UnionTarget[],
  sourceChapters: readonly ChapterVerses[] = [],
): { ref: ScriptureRef; widened: boolean } {
  const src = asNumbering(from)
  const startOf = (r: ScriptureRef): Pos => [r.chapter, r.verse ?? 1]
  const endOf = (r: ScriptureRef): Pos => {
    const c = r.endChapter ?? r.chapter
    return [c, r.verse === undefined ? verseCount(r.book, c, src) : (r.endVerse ?? r.verse)]
  }
  let lo = startOf(range)
  let hi = endOf(range)
  const grow = (a: Pos, b: Pos) => {
    if (before(a, lo)) lo = a
    if (before(hi, b)) hi = b
  }
  const ref = (): ScriptureRef => {
    const r: ScriptureRef = { book: range.book, chapter: lo[0], verse: lo[1] }
    if (hi[0] !== lo[0]) r.endChapter = hi[0]
    if (hi[0] !== lo[0] || hi[1] !== lo[1]) r.endVerse = hi[1]
    return r
  }
  for (let round = 0; round < 8; round++) {
    const was = `${lo}|${hi}`
    for (const c of sourceChapters) {
      const r = resolveInChapter(ref(), c)
      if (r && r !== 'notInTranslation') grow([c.chapter, r.printedStart], [c.chapter, r.printedEnd])
    }
    for (const t of targets) {
      for (const slice of mapRange(ref(), src, t.numbering)) {
        const chapter = t.chapters.find((c) => c.book === slice.book && c.chapter === slice.chapter)
        if (!chapter || slice.kind === 'unmapped') continue
        const units = targetUnits(chapter, slice)
        if (units.kind !== 'text' || !units.bridged) continue
        const wide: ScriptureRef = { book: slice.book, chapter: slice.chapter, verse: units.printedStart }
        if (units.printedEnd > units.printedStart) wide.endVerse = units.printedEnd
        for (const back of mapRange(wide, t.numbering, src)) {
          if (back.kind === 'unmapped' || back.startVerse === 0) continue
          grow([back.chapter, back.startVerse], [back.chapter, back.endVerse])
        }
      }
    }
    if (`${lo}|${hi}` === was) break
  }
  const out = ref()
  const a = startOf(range)
  const b = endOf(range)
  return { ref: out, widened: before(lo, a) || before(b, hi) }
}
