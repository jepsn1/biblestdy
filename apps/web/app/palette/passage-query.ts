import { BOOKS, DANISH_BOOKS, type Book, type BookId, type BookLocale, type Reference } from "@biblestdy/shared";

/**
 * Passage search for the palette: typed text → the passages it most likely
 * means, best first (one keystroke's work, so plain loops over 66 books).
 * Forgiving where `parseReference` is strict; the reader's own jump box
 * keeps the strict one.
 *
 * Rules, in order:
 * 1. Book, then numbers ("john 3:16"). The book may be glued to its numbers
 *    ("jn3:16", "j3") and the verse separated by `:` `,` `.` `v` or a space
 *    ("3:16" "3,16" "3.16" "3v16" "3 16"); a range ends in `-`/`–` with a
 *    verse or chapter:verse ("3:16-18", "3:16–4:2"). A trailing separator
 *    while typing ("john 3:") is ignored.
 * 2. A numbered book takes its number first: digits ("1jn", "1 joh", "1.
 *    mos"), roman ("i john", followed by a space) or words ("first",
 *    "første", "anden", "tredje"). "3 john" is the book 3 John; "3 john 4"
 *    is 3 John 4.
 * 3. A one-chapter book (Obadiah, Philemon, 2–3 John, Jude) reads a single
 *    number as a verse: "jude 5" = Jude 1:5.
 * 4. Numbers first, then the book ("3:16 john", "16 john", "2 rom"): chapter
 *    [and verse] before the book. Only when rule 2 doesn't give a passage
 *    ("2 rom": no 2 Romans), or with a verse after the book that the
 *    numbered book can't have ("3 john 16" = John 3:16; 3 John has 15
 *    verses). Not supported: two bare numbers before a book ("16 3 john").
 * 5. Book names match English and Danish names and abbreviations (SBL,
 *    USFM/OSIS ids, Bibelselskabet), case-, accent- and space-insensitive
 *    (æ ø å, or ae oe aa): "Åb 21", "sl 23", "1 mos 1". Tiers, best first:
 *    exact (UI language first: "es" = Esther in English, Esajas in Danish),
 *    a name starting with it ("j", "phil"), an abbreviation starting with it,
 *    a numbered book typed without its number ("cor 13" → 1 and 2
 *    Corinthians), then a typo (≤1 edit for 4–6 letters, ≤2 from 7: "jonh",
 *    "phillipians"). An exact match shows only exact matches; otherwise up
 *    to `limit` rows across tiers, each tier in order of how often the book
 *    is read (`POPULAR`): "j3" = John 3, James 3, Job 3…
 * 6. Impossible places drop out: a chapter past the book's end, a verse past
 *    a one-chapter book's end. Other verse counts aren't known here (they
 *    vary by translation): the reader handles those. A broken range end
 *    ("3:16-1" while typing 18) is dropped, keeping the start.
 */

export type PassageHit = {
  ref: Reference;
  /** How the book matched: `fuzzy` (a typo) is only a guess. */
  kind: "exact" | "prefix" | "fuzzy";
};

/** Most read first (gospels, Psalms, Romans…); the rest in canonical order. */
const POPULAR: BookId[] = [
  "JHN", "PSA", "ROM", "MAT", "GEN", "ISA", "LUK", "MRK", "ACT", "1CO", "PRO", "HEB", "EPH", "PHP", "JAS",
  "REV", "GAL", "1JN", "COL", "EXO", "JER", "1PE", "2CO", "JOB", "2TI", "DAN", "1TH", "ECC", "DEU", "JOS",
  "1SA", "2SA", "EZK", "1TI", "JDG", "RUT", "JON", "MIC", "JOL", "LAM",
];
const popularity = new Map<string, number>();
for (const b of [...POPULAR, ...BOOKS.map((b) => b.id)]) if (!popularity.has(b)) popularity.set(b, popularity.size);

/** Verses of the one-chapter books (the longest common count: 3 John has 14 in KJV). */
const ONE_CHAPTER_VERSES: Record<string, number> = { OBA: 21, PHM: 25, "2JN": 13, "3JN": 15, JUD: 25 };

/** Lowercase, accents off, Danish letters as one ASCII spelling (æ→ae ø→o å→a). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Book ordinals as typed: "1", "1.", "i ", "first ", "første ". */
const ORDINAL_WORDS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, first: 1, second: 2, third: 3, "1st": 1, "2nd": 2, "3rd": 3,
  forste: 1, foerste: 1, anden: 2, andet: 2, tredje: 3,
};
const ORDINAL = /^(?:([123])\.?\s*(?!(?:st|nd|rd)\s)|(iii|ii|i|first|second|third|1st|2nd|3rd|forste|foerste|anden|andet|tredje)[\s.]+)(?=[a-z])/;

/** "1 samuel" → { ord: 1, text: "samuel" }; spaces, dots, apostrophes out. */
function splitOrdinal(s: string): { ord?: number; text: string } {
  const m = ORDINAL.exec(s);
  const ord = m ? Number(m[1] ?? 0) || ORDINAL_WORDS[m[2]] : undefined;
  return { ord, text: (m ? s.slice(m[0].length) : s).replace(/[\s.'’]/g, "") };
}

type Key = { ord?: number; text: string; name: boolean; locale: BookLocale };
type Entry = { book: Book; keys: Key[] };

/** Every way to write each book, folded (built once). */
const INDEX: Entry[] = BOOKS.map((book) => {
  const keys: Key[] = [];
  const add = (raw: string, name: boolean, locale: BookLocale) => {
    const lower = raw.toLowerCase();
    // Danish letters also as typed on an English keyboard (ø→oe, å→aa)
    for (const v of new Set([lower, lower.replace(/ø/g, "oe").replace(/å/g, "aa")])) {
      const k = splitOrdinal(fold(v));
      if (k.text) keys.push({ ...k, name, locale });
    }
  };
  add(book.name, true, "en");
  add(book.id, false, "en");
  for (const a of book.aliases) add(a, false, "en");
  const [daName, ...daAliases] = DANISH_BOOKS[book.id as BookId];
  add(daName, true, "da");
  for (const a of daAliases) add(a, false, "da");
  return { book, keys };
});

/** Edit distance with transpositions ("jonh" ↔ "john" = 1), giving up past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a word this long (none under 4 letters: "joy" isn't Job). */
const typos = (n: number) => (n < 4 ? 0 : n < 7 ? 1 : 2);

/** Tiers (rule 5): 0 exact, 1 exact other language, 2 name prefix,
 * 3 abbreviation prefix, 4 number left off, 5 typo. */
function tier(e: Entry, ord: number | undefined, text: string, locale: BookLocale): number | undefined {
  let best: number | undefined;
  const take = (t: number) => (best = best === undefined ? t : Math.min(best, t));
  for (const k of e.keys) {
    if (k.ord !== ord) {
      // "cor 13": a numbered book typed without its number
      if (ord === undefined && (k.text === text || k.text.startsWith(text))) take(4);
      continue;
    }
    if (k.text === text) take(k.locale === locale ? 0 : 1);
    else if (k.text.startsWith(text)) take(k.name ? 2 : 3);
    else if (k.name || k.text.length >= 4) {
      const max = typos(text.length);
      if (max && distance(text, k.text, max) <= max) take(5);
    }
  }
  return best;
}

/** Books a typed name could be, best first. */
function matchBooks(ord: number | undefined, text: string, locale: BookLocale): { book: Book; tier: number }[] {
  if (!text) return [];
  const out: { book: Book; tier: number }[] = [];
  for (const e of INDEX) {
    const t = tier(e, ord, text, locale);
    if (t !== undefined) out.push({ book: e.book, tier: t });
  }
  return out.sort((a, b) => a.tier - b.tier || popularity.get(a.book.id)! - popularity.get(b.book.id)!);
}

type Nums = { c: number; v?: number; ec?: number; ev?: number };

/** A place in a book, or null where it can't be (rules 3 and 6). */
function place(book: Book, n: Nums): Reference | null {
  const oneVerses = ONE_CHAPTER_VERSES[book.id];
  // "jude 5" = Jude 1:5; "jude 3-5" = Jude 1:3-5
  if (oneVerses && n.v === undefined && n.c > 1) n = { c: 1, v: n.c, ev: n.ev };
  if (n.c < 1 || n.c > book.chapters) return null;
  if (!n.v) return { book: book.id, chapter: n.c };
  if (oneVerses && n.v > oneVerses) return null;
  const ref: Reference = { book: book.id, chapter: n.c, verse: n.v };
  if (n.ev !== undefined) {
    const ec = n.ec ?? n.c;
    const ok = ec <= book.chapters && (ec > n.c || (ec === n.c && n.ev > n.v)) && !(oneVerses && n.ev > oneVerses);
    if (ok) {
      ref.endChapter = ec;
      ref.endVerse = n.ev;
    }
  }
  return ref;
}

/** Folded input, ranges as "-", "3v16" as "3:16", trailing separators off. */
function normalize(input: string): string {
  return fold(input)
    .replace(/[‐-―−]/g, "-")
    .replace(/(\d)\s*v\s*(?=\d)/g, "$1:")
    .replace(/[\s:,.\-]+$/, "")
    .trim();
}

const NUMS = String.raw`(\d+)(?:\s*[:,.]\s*(\d+)|\s+(\d+))?(?:\s*-\s*(?:(\d+)\s*[:,.]\s*)?(\d+))?`;
// Rules 1–2: [ordinal] book [numbers]
const FORWARD = new RegExp(String.raw`^((?:[123] |1st |2nd |3rd )?[a-z][a-z\s.'’]*?)\s*(?:${NUMS})?$`);
// Rule 4: chapter[:verse[-verse]] book [verse]
const REVERSE = new RegExp(String.raw`^(\d+)(?:\s*[:,.]\s*(\d+)(?:\s*-\s*(\d+))?)?\s*([a-z][a-z\s.'’]*?)(?:\s+(\d+))?$`);

const nums = (m: RegExpExecArray, at: number): Nums | undefined => {
  if (m[at] === undefined) return undefined;
  const [c, v1, v2, ec, ev] = m.slice(at, at + 5).map((x) => (x === undefined ? undefined : Number(x)));
  return { c: c!, v: v1 ?? v2, ec, ev };
};

/** Passages for the typed text (rules above), best first; [] = not a passage. */
export function findPassages(input: string, locale: BookLocale, limit = 5): PassageHit[] {
  const s = normalize(input);
  const out: (PassageHit & { tier: number })[] = [];
  const push = (book: Book, t: number, n: Nums) => {
    // "johan 3" isn't 2 John 1:3: rule 3 needs the book's number typed
    if (t === 4 && ONE_CHAPTER_VERSES[book.id] && n.v === undefined) return;
    const ref = place(book, n);
    if (ref && !out.some((h) => h.ref.book === ref.book)) {
      out.push({ ref, tier: t, kind: t <= 1 ? "exact" : t <= 4 ? "prefix" : "fuzzy" });
    }
  };

  // Rules 1–3
  const f = /^[a-z123]/.test(s) ? FORWARD.exec(s.replace(/^([123])\.?\s*(?=[a-z])(?!(?:st|nd|rd)\s)/, "$1 ")) : null;
  const book = f ? splitOrdinal(f[1].trim()) : undefined;
  const n = f ? nums(f, 2) : undefined;
  if (book && n) for (const m of matchBooks(book.ord, book.text, locale)) push(m.book, m.tier, n);
  // A book alone ("3 john", "john") is no passage: see `reversedBook`
  else if (book && matchBooks(book.ord, book.text, locale).length) return [];

  // Rule 4, when rule 2 gave nothing: "2 rom", "3:16 john", "3 john 16"
  if (!out.length) {
    const r = REVERSE.exec(s);
    if (r) {
      const text = splitOrdinal(r[4].trim());
      const n: Nums = { c: Number(r[1]), v: r[2] ? Number(r[2]) : r[5] ? Number(r[5]) : undefined };
      if (r[2] && r[3]) n.ev = Number(r[3]);
      // Both a verse before and after the book: not a reading we know
      if (text.ord === undefined && !(r[2] && r[5])) {
        for (const m of matchBooks(undefined, text.text, locale)) push(m.book, m.tier, n);
      }
    }
  }

  const exact = out.some((h) => h.tier <= 1);
  return out
    .sort((a, b) => a.tier - b.tier || popularity.get(a.ref.book)! - popularity.get(b.ref.book)!)
    .filter((h) => !exact || h.tier <= 1)
    .slice(0, limit)
    .map(({ ref, kind }) => ({ ref, kind }));
}

/**
 * "3 john" (no chapter): the book 3 John, but maybe John 3 — the other
 * reading, offered after the book (rule 4 for a book-only query). Only for a
 * book that exists without the number ("1 sam" isn't Sam 1).
 */
export function reversedBook(input: string, locale: BookLocale): PassageHit | undefined {
  const m = /^([123])\s*([a-z][a-z\s.'’]*)$/.exec(normalize(input));
  if (!m) return undefined;
  const text = splitOrdinal(m[2].trim()).text;
  const hit = matchBooks(undefined, text, locale).find((b) => b.tier <= 1);
  const ref = hit && place(hit.book, { c: Number(m[1]) });
  return ref ? { ref, kind: "exact" } : undefined;
}

/** Book-name text with a worded ordinal as a digit ("first john" → "1 john"),
 * for book suggestions. */
export function bookQuery(input: string): string {
  const s = fold(input).trim();
  const m = ORDINAL.exec(s);
  return m && !m[1] ? `${ORDINAL_WORDS[m[2]]} ${s.slice(m[0].length)}` : input;
}

/** Books a mistyped name could be ("phillipians"), for when nothing starts
 * with it. Typos only (rule 5), and from 5 letters: a lone word is more
 * likely a search ("dark" isn't Mark) than a book. */
export function typoBooks(input: string, locale: BookLocale, limit = 3): string[] {
  const { ord, text } = splitOrdinal(normalize(bookQuery(input)));
  if (text.length < 5) return [];
  return matchBooks(ord, text, locale)
    .filter((m) => m.tier === 5)
    .slice(0, limit)
    .map((m) => m.book.id);
}
