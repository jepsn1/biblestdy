#!/usr/bin/env node
/**
 * One-off: record the verse NUMBERS (and bridge labels) of every chapter of
 * every curated translation, for the versification map's fixture test (#166).
 * Numbers only — the verse text is read in memory to see which verses are
 * non-empty (as parseChapterContent does) and is never written anywhere.
 *
 * Why not the dev API: its reading quota (150 chapters/day per reader) can't
 * cover 1,189 × 4 chapters. This talks to API.Bible directly with the
 * server's key, provider-level, in ~250-verse passages (API.Bible serves at
 * most 200 verses per passage): ~1,000 calls in total, a few minutes.
 *
 * Usage (from the repo root):
 *   node --env-file=apps/api/.env tools/versification/verse-counts.mjs
 * Writes packages/shared/src/fixtures/verse-numbers.json.
 *
 * Fixture format: translations[abbr][book] = one string per chapter
 * (index 0 = chapter 1; null = the translation has no such chapter). A
 * string lists the chapter's verse units: "a-b" = single verses a..b,
 * "a~b" = ONE bridged unit printed "a–b", "a" = one verse.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOOKS } from '../../packages/shared/dist/index.js'

const KEY = process.env.API_BIBLE_KEY
if (!KEY) throw new Error('API_BIBLE_KEY not set (node --env-file=apps/api/.env …)')
const BASE = 'https://api.scripture.api.bible/v1'
/** Same ids as apps/api/src/scripture/apibible.provider.ts (CURATED + BPH). */
const BIBLES = {
  NIV: '78a9f6124f344018-01',
  WEB: '9879dbb7cfe39e4d-01',
  NKJV: '63097d2a0a2f7db3-01',
  BPH: '20c3695eb7339cca-01',
}
const PASSAGE_CAP = 200
const HEADING_STYLES = new Set(['s', 's1', 's2', 's3', 'ms', 'ms1', 'ms2'])
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../packages/shared/src/fixtures/verse-numbers.json')

let calls = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path) {
  for (let attempt = 0; ; attempt++) {
    calls++
    const res = await fetch(`${BASE}${path}`, { headers: { 'api-key': KEY } })
    if (res.ok) return (await res.json()).data
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    throw new Error(`API.Bible ${res.status} for ${path}`)
  }
}

/** Verse units with text, keyed "chapter" → Map(verse → label|null). */
function unitsOf(content, into) {
  let current = null // { chapter, verse }
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.name === 'para' && HEADING_STYLES.has(node.attrs?.style ?? '')) continue
      if (node.name === 'verse' && node.attrs?.sid) {
        const m = /\s(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(node.attrs.sid)
        if (m) current = { chapter: Number(m[1]), verse: Number(m[2]), end: m[3] ? Number(m[3]) : null }
        continue
      }
      if (node.type === 'text' && node.text?.trim() && current) {
        const ch = into.get(current.chapter) ?? new Map()
        ch.set(current.verse, current.end)
        into.set(current.chapter, ch)
      }
      if (node.items) walk(node.items)
    }
  }
  walk(content)
}

function encode(units) {
  const sorted = [...units.entries()].sort(([a], [b]) => a - b)
  const out = []
  let run = null
  const flush = () => {
    if (run) out.push(run[0] === run[1] ? `${run[0]}` : `${run[0]}-${run[1]}`)
    run = null
  }
  for (const [verse, end] of sorted) {
    if (end) {
      flush()
      out.push(`${verse}~${end}`)
    } else if (run && verse === run[1] + 1) run[1] = verse
    else {
      flush()
      run = [verse, verse]
    }
  }
  flush()
  return out.join(',')
}

async function book(bibleId, id) {
  const chapters = (await get(`/bibles/${bibleId}/books/${id}/chapters`))
    .map((c) => Number(c.number))
    .filter((n) => Number.isInteger(n) && n > 0)
  const last = Math.max(...chapters)
  const found = new Map()
  let from = Math.min(...chapters)
  while (from <= last) {
    const p = await get(
      `/bibles/${bibleId}/passages/${id}.${from}-${id}.${last}?content-type=json&include-notes=false&include-titles=true`,
    )
    const got = p.chapterIds.map((c) => Number(c.split('.')[1]))
    const units = new Map()
    unitsOf(p.content, units)
    const truncated = p.verseCount >= PASSAGE_CAP
    // A truncated passage may stop mid-chapter: keep only whole chapters
    const complete = truncated ? got.slice(0, -1) : got
    if (complete.length === 0) {
      // One chapter longer than a passage: fetch it alone
      const c = await get(`/bibles/${bibleId}/chapters/${id}.${from}?content-type=json&include-notes=false&include-titles=true`)
      const one = new Map()
      unitsOf(c.content, one)
      found.set(from, one.get(from) ?? new Map())
      from++
      continue
    }
    for (const c of complete) found.set(c, units.get(c) ?? new Map())
    from = Math.max(...complete) + 1
    await sleep(150)
  }
  const out = []
  for (let c = 1; c <= last; c++) out.push(found.has(c) ? encode(found.get(c)) : null)
  return out
}

const translations = {}
for (const [abbr, bibleId] of Object.entries(BIBLES)) {
  translations[abbr] = {}
  for (const b of BOOKS) {
    translations[abbr][b.id] = await book(bibleId, b.id)
    process.stderr.write(`${abbr} ${b.id} (${calls} calls)\n`)
  }
}
writeFileSync(
  OUT,
  JSON.stringify(
    {
      about: 'Verse numbers + bridges per chapter as API.Bible serves them (numbers only, no text). tools/versification/verse-counts.mjs',
      generated: new Date().toISOString().slice(0, 10),
      translations,
    },
    null,
    1,
  ) + '\n',
)
process.stderr.write(`wrote ${OUT} (${calls} API.Bible calls)\n`)
