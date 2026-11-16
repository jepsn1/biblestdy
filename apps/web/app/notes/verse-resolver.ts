import {
  formatScriptureHref,
  resolveInChapter,
  suggestBooks,
  toScriptureRef,
  words,
  type BookLocale,
  type Chapter,
  type ScriptureRef,
} from "@biblestdy/shared";
import { findPassages } from "../palette/passage-query";

/**
 * The one resolver behind a note's inline references (#160): the `@`
 * typeahead and the "+ Verse" dialog both turn typed text into these
 * options. Pure — tested in verse-resolver.test.ts.
 */

export type VerseOption =
  /** A passage to insert. `fuzzy` = found through a typo (a guess). */
  | { kind: "ref"; ref: ScriptureRef; href: string; fuzzy: boolean }
  /** A book name to complete ("joh" → "Johannes "), then type the chapter. */
  | { kind: "book"; book: string; name: string };

/** Passages first (the parsed match leads), then book names; at most `limit`. */
export function verseOptions(query: string, locale: BookLocale, limit = 6): VerseOption[] {
  const q = query.trim();
  if (!q) return [];
  const out: VerseOption[] = [];
  const seen = new Set<string>();
  for (const hit of findPassages(q, locale, limit)) {
    const ref = toScriptureRef(hit.ref);
    const href = ref && formatScriptureHref(ref);
    if (!ref || !href || seen.has(href)) continue;
    seen.add(href);
    out.push({ kind: "ref", ref, href, fuzzy: hit.kind === "fuzzy" });
  }
  // Book names only while no number is typed: "joh" → Johannes, John's letters
  if (!/\d\s*$/.test(q) || /^\d\s*$/.test(q)) {
    const books = suggestBooks(q, locale, limit);
    for (const b of books) {
      if (out.length >= limit) break;
      out.push({ kind: "book", book: b.id, name: b.name });
    }
  }
  return out.slice(0, limit);
}

/**
 * The `@` query being typed, from the text before the caret (in one text
 * run); null when there is none. `@` opens only at the start of a word — an
 * email ("a@b.dk") never does. Once the query has a space and nothing
 * matches (no reference, nor `matches`), it's ordinary text ("@ home", "@hello world") and the menu stays
 * shut.
 */
export function atQuery(
  before: string,
  locale: BookLocale,
  /** Other hits that keep a spaced query open (a page mark's words, #191). */
  matches?: (query: string) => boolean,
): { query: string; start: number } | null {
  const m = /(^|[\s([{"'«»„“‘])@([^@\n]{0,40})$/u.exec(before);
  if (!m) return null;
  const query = m[2];
  if (/^\s/.test(query)) return null;
  if (/\s/.test(query) && verseOptions(query, locale, 1).length === 0 && !matches?.(query)) return null;
  return { query, start: m.index + m[1].length };
}

/** The first `n` words of a reference in a loaded chapter (bridges count
 * whole), or "" when the chapter doesn't hold it. */
export function firstWords(chapter: Chapter | undefined, ref: ScriptureRef, n = 8): string {
  if (!chapter) return "";
  const at = resolveInChapter(ref, chapter);
  if (!at || at === "notInTranslation") return "";
  const out: string[] = [];
  for (const v of chapter.verses) {
    if (v.verse < at.startVerse || v.verse > at.endVerse) continue;
    out.push(...words(v.text));
    if (out.length >= n) break;
  }
  return out.length > n ? `${out.slice(0, n).join(" ")}…` : out.join(" ");
}

/** The reader URL that reads a reference: its first chapter, `?v=` the
 * verses there (a cross-chapter range runs to that chapter's end). */
export function readHref(ref: ScriptureRef, noteId?: string): string {
  const params = new URLSearchParams();
  if (ref.verse !== undefined) {
    const crosses = ref.endChapter !== undefined && ref.endChapter !== ref.chapter;
    params.set("v", crosses ? `${ref.verse}-` : ref.endVerse !== undefined ? `${ref.verse}-${ref.endVerse}` : `${ref.verse}`);
  }
  if (noteId) params.set("note", noteId);
  const qs = params.toString();
  return `/read/${ref.book}/${ref.chapter}${qs ? `?${qs}` : ""}`;
}
