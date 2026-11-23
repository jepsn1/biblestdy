import type { BookLocale, ScriptureRef } from "@biblestdy/shared";
import { filterMarks, type PageMark } from "../notes/page-marks";
import { verseOptions } from "../notes/verse-resolver";

/** One row of the docked verse search (#277 panel V-A). */
export type VerseSuggestion =
  /** A passage: a tap (or Insert) puts its chip in the note. */
  | { kind: "ref"; key: string; ref: ScriptureRef; fuzzy: boolean }
  /** A book name alone: a tap fills it in, to go on with the chapter. */
  | { kind: "book"; key: string; book: string; name: string }
  /** A mark in the open chapter: the chip is tagged with it (#216). */
  | { kind: "mark"; key: string; mark: PageMark };

/**
 * What the docked verse search lists over the keyboard, at most `limit`
 * rows: with nothing typed, the open chapter's marks (the verse you're
 * looking at is the likeliest one, Sofie/Elias); else what the text
 * resolves to — the parsed passage first (what Insert inserts), then book
 * names to complete — and the chapter's marks that match.
 */
export function verseSuggestions(
  text: string,
  locale: BookLocale,
  marks: readonly PageMark[],
  describe: (m: PageMark) => string = () => "",
  limit = 4,
): VerseSuggestion[] {
  const q = text.trim();
  const fromMarks = filterMarks(marks, q, locale, describe).map(
    (mark): VerseSuggestion => ({ kind: "mark", key: `mark:${mark.href}`, mark }),
  );
  if (!q) return fromMarks.slice(0, limit);
  const out: VerseSuggestion[] = verseOptions(q, locale, limit).map((o) =>
    o.kind === "ref"
      ? { kind: "ref", key: `ref:${o.href}`, ref: o.ref, fuzzy: o.fuzzy }
      : { kind: "book", key: `book:${o.book}`, book: o.book, name: o.name },
  );
  return [...out, ...fromMarks].slice(0, limit);
}

/** What Insert / Enter takes: the first row, if it's a passage or a mark. */
export function insertable(rows: readonly VerseSuggestion[]): VerseSuggestion | null {
  const first = rows[0];
  return first && first.kind !== "book" ? first : null;
}

/** The text a book row fills in ("Romans "), ready for the chapter. */
export function bookFill(name: string): string {
  return `${name} `;
}
