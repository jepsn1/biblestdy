import {
  formatScriptureHref,
  words,
  type Annotation,
  type AnnotationMark,
  type BookLocale,
  type Chapter,
  type Highlight,
  type HighlightColor,
  type MarkLink,
  type ScriptureRef,
} from "@biblestdy/shared";
import { chipLabel } from "~/lib/reference-label";
import { verseOptions } from "./verse-resolver";

/**
 * The reader's marks on the open chapter as `@` suggestions (#191): what's
 * already scribbled on the page — highlights and pen marks — comes first in
 * a note's `@` menu and the "+ Verse" dialog. Pure; page-marks.test.ts.
 */

/** How a passage is marked (said in words, never by colour alone). */
export type MarkKind =
  | { type: "highlight"; color: HighlightColor }
  /** `mark` null = the pen's automatic style; `text` = a margin note. */
  | { type: "pen"; mark: AnnotationMark | null; text: boolean };

export type PageMark = {
  /** Canonical numbering — what the chip stores (translation-agnostic). */
  ref: ScriptureRef;
  href: string;
  /** In the read translation's own numbering (what the page shows). */
  local: ScriptureRef;
  /** The marked words, shortened. */
  snippet: string;
  /** One passage marked several ways (highlighted and underlined): one row. */
  kinds: MarkKind[];
  /** The mark a pick tags the chip with (#216): the row's first kind's
   * (highlights first), so its swatch is what it links. */
  mark: MarkLink;
};

/** How a highlight or pen mark is marked. */
export function markKindOf(m: Highlight | Annotation): MarkKind {
  return "color" in m ? { type: "highlight", color: m.color } : { type: "pen", mark: m.mark ?? null, text: !!m.text?.trim() };
}

type Marked = Pick<Highlight, "startVerse" | "startWord" | "endVerse" | "endWord" | "book" | "chapter" | "quote">;

/** The marked words: the stored quote, else cut from the loaded text. */
function markedWords(m: Marked, chapter: Chapter | undefined): string[] {
  if (m.quote) return words(m.quote);
  if (!chapter) return [];
  const out: string[] = [];
  for (const v of chapter.verses) {
    if (v.verse < m.startVerse || v.verse > m.endVerse) continue;
    const w = words(v.text);
    const from = v.verse === m.startVerse ? m.startWord : 0;
    const to = v.verse === m.endVerse ? m.endWord : w.length - 1;
    out.push(...w.slice(from, to + 1));
  }
  return out;
}

function shorten(w: string[], n: number): string {
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : w.join(" ");
}

const sameKind = (a: MarkKind, b: MarkKind) =>
  a.type === "highlight" ? b.type === "highlight" && a.color === b.color : b.type === "pen" && a.mark === b.mark && a.text === b.text;

/**
 * The chapter's marks in reading order (where they start), one row per
 * passage. `canonical` maps the translation's numbering to the canonical
 * one (BPH Mal 3,20 → Mal 4:2); null drops a mark with no counterpart.
 */
export function pageMarks(
  highlights: readonly Highlight[],
  annotations: readonly Annotation[],
  chapter: Chapter | undefined,
  canonical: (local: ScriptureRef) => ScriptureRef | null = (r) => r,
  snippetWords = 8,
): PageMark[] {
  const all: { m: Marked; kind: MarkKind; link: MarkLink }[] = [
    ...highlights.map((h) => ({ m: h, kind: markKindOf(h), link: { kind: "highlight", id: h.id } as MarkLink })),
    ...annotations.map((a) => ({ m: a, kind: markKindOf(a), link: { kind: "annotation", id: a.id } as MarkLink })),
  ];
  all.sort((a, b) => a.m.startVerse - b.m.startVerse || a.m.startWord - b.m.startWord || a.m.endVerse - b.m.endVerse || a.m.endWord - b.m.endWord);
  const out: PageMark[] = [];
  const byHref = new Map<string, PageMark>();
  for (const { m, kind, link } of all) {
    const local: ScriptureRef = { book: m.book, chapter: m.chapter, verse: m.startVerse };
    if (m.endVerse > m.startVerse) local.endVerse = m.endVerse;
    const ref = canonical(local);
    const href = ref && formatScriptureHref(ref);
    if (!ref || !href) continue;
    const seen = byHref.get(href);
    if (seen) {
      // Its first highlight, else its first pen mark
      if (seen.mark.kind === "annotation" && link.kind === "highlight") seen.mark = link;
      if (!seen.kinds.some((k) => sameKind(k, kind))) seen.kinds.push(kind);
      if (!seen.snippet) seen.snippet = shorten(markedWords(m, chapter), snippetWords);
      continue;
    }
    const row: PageMark = { ref, href, local, snippet: shorten(markedWords(m, chapter), snippetWords), kinds: [kind], mark: link };
    byHref.set(href, row);
    out.push(row);
  }
  // Highlights first: the row's swatch is its first kind
  for (const r of out) r.kinds.sort((a, b) => Number(a.type === "pen") - Number(b.type === "pen"));
  return out;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ /g, " ")
    .toLocaleLowerCase();

const covers = (r: ScriptureRef, chapter: number, verse: number) =>
  r.chapter === chapter && r.verse !== undefined && verse >= r.verse && verse <= (r.endVerse ?? r.verse);

/** Whether two references share a verse (both one chapter, or whole chapters). */
function overlaps(a: ScriptureRef, b: ScriptureRef): boolean {
  if (a.book !== b.book) return false;
  const start = (r: ScriptureRef) => [r.chapter, r.verse ?? 0] as const;
  const end = (r: ScriptureRef) => [r.endChapter ?? r.chapter, r.endVerse ?? r.verse ?? Infinity] as const;
  const le = (x: readonly [number, number], y: readonly [number, number]) => x[0] < y[0] || (x[0] === y[0] && x[1] <= y[1]);
  return le(start(a), end(b)) && le(start(b), end(a));
}

/**
 * The marks the `@` query is after, in reading order: all of them while
 * nothing is typed; else a verse number on the page ("16", "3,16"), a
 * reference they overlap ("joh 3,16"), or words of the reference, the
 * marked text or how it's marked ("gud elsk", "understreg", "guld" —
 * accents and case aside). `describe` = the mark's kind in words.
 */
export function filterMarks(
  marks: readonly PageMark[],
  query: string,
  locale: BookLocale,
  describe: (m: PageMark) => string = () => "",
): PageMark[] {
  const q = query.trim();
  if (!q) return [...marks];
  const num = /^(?:(\d+)\s*[,:.]\s*)?(\d+)$/.exec(q);
  if (num) {
    const verse = Number(num[2]);
    return marks.filter((m) => {
      if (num[1] === undefined) return covers(m.local, m.local.chapter, verse) || covers(m.ref, m.ref.chapter, verse);
      const chapter = Number(num[1]);
      return covers(m.local, chapter, verse) || covers(m.ref, chapter, verse);
    });
  }
  const parsed = verseOptions(q, locale, 1)[0];
  const terms = fold(q).split(/\s+/).filter(Boolean);
  return marks.filter((m) => {
    if (parsed?.kind === "ref" && /\d/.test(q) && (overlaps(parsed.ref, m.ref) || overlaps(parsed.ref, m.local))) return true;
    const hay = fold(`${chipLabel(m.ref, locale)} ${chipLabel(m.local, locale)} ${m.snippet} ${describe(m)}`);
    return terms.every((t) => hay.includes(t));
  });
}
