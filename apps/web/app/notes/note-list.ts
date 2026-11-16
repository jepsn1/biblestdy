import {
  bookIndex,
  words,
  type Anchor,
  type BookLocale,
  type Chapter,
  type Note,
  type Reference,
} from "@biblestdy/shared";
import { referenceLabel } from "~/lib/reference-label";
import { plainText } from "../palette/palette-results";

/**
 * The Notes page's pure parts (notes plan, Phase 1): how a note is named and
 * where it points, in the UI language; filtering and ordering the list; and
 * turning a typed passage into an anchor. No React, no fetching — tested in
 * note-list.test.ts.
 */

/** A note's name: its title, else its first line, else `untitled`. */
export function noteTitle(note: Pick<Note, "title" | "body">, untitled: string): string {
  const title = note.title.trim();
  if (title) return title;
  const first = note.body.split("\n").map(plainText).find((l) => l !== "");
  if (!first) return untitled;
  return first.length > 60 ? `${first.slice(0, 60).trimEnd()}…` : first;
}

/** A reference in the UI language (lib/reference-label.ts). */
export { referenceLabel };

/** An anchor's verse range in the UI language. */
export function anchorLabel(a: Anchor, bookName: (id: string) => string, locale: BookLocale): string {
  return referenceLabel({ book: a.book, chapter: a.chapter, verse: a.startVerse, endVerse: a.endVerse }, bookName, locale);
}

/** Bible order of two anchors (book, chapter, verse, word). */
export function compareAnchors(a: Anchor, b: Anchor): number {
  return (
    bookIndex(a.book) - bookIndex(b.book) ||
    a.chapter - b.chapter ||
    a.startVerse - b.startVerse ||
    a.startWord - b.startWord
  );
}

export type NoteSort = "recent" | "bible";

/** Lowercase, accents and Danish letters folded, so "Nåde" finds "nade". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * The list as shown: notes with the topic (if one is chosen) whose title,
 * text, references (in either spelling the reader sees) or topics contain
 * every typed word; "recent" = last edit first (the API's order), "bible" =
 * by first reference, notes without passages last.
 */
export function filterNotes(
  notes: Note[],
  { query, topic, sort, bookName, locale }: { query: string; topic: string | null; sort: NoteSort; bookName: (id: string) => string; locale: BookLocale },
): Note[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const hits = notes.filter((n) => {
    if (topic && !n.tags?.some((t) => t.name === topic)) return false;
    if (terms.length === 0) return true;
    const hay = fold(
      [
        n.title,
        plainText(n.body),
        ...n.anchors.map((a) => anchorLabel(a, bookName, locale)),
        ...n.anchors.map((a) => `${a.book} ${a.chapter}:${a.startVerse}`),
        ...(n.tags ?? []).map((t) => t.name),
      ].join(" \n "),
    );
    return terms.every((t) => hay.includes(t));
  });
  if (sort === "recent") return hits;
  const first = (n: Note) => [...n.anchors].sort(compareAnchors)[0];
  return [...hits].sort((x, y) => {
    const a = first(x);
    const b = first(y);
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    return compareAnchors(a, b);
  });
}

/** Why a typed passage can't become a reference. */
export type ReferenceProblem = "noChapter" | "crossChapter" | "noVerse";

/**
 * A typed passage → a note anchor over whole verses in the chapter's
 * translation: a chapter alone covers all of it, a verse its every word.
 * An anchor sits in one chapter, so a range into the next is refused.
 */
export function anchorForReference(ref: Reference, chapter: Chapter): Anchor | ReferenceProblem {
  if (ref.chapter === undefined) return "noChapter";
  if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) return "crossChapter";
  const verses = chapter.verses;
  if (verses.length === 0) return "noVerse";
  const start = ref.verse === undefined ? verses[0] : verses.find((v) => v.verse === ref.verse);
  const endNum = ref.verse === undefined ? verses[verses.length - 1].verse : (ref.endVerse ?? ref.verse);
  // A range running past the chapter's end stops at its last verse
  const end = verses.find((v) => v.verse === endNum) ?? (endNum > verses[verses.length - 1].verse ? verses[verses.length - 1] : undefined);
  if (!start || !end || end.verse < start.verse) return "noVerse";
  return {
    translationId: chapter.translationId,
    book: chapter.book,
    chapter: chapter.chapter,
    startVerse: start.verse,
    startWord: 0,
    endVerse: end.verse,
    endWord: Math.max(0, words(end.text).length - 1),
  };
}

/**
 * Keeps the list still while a note is being edited: `notes` in the order of
 * `frozen` (ids as they stood when the view was entered), notes not in it
 * (new since) first in their given order. Saving a note bumps its last-edit
 * time — without this the row would jump to the top mid-sentence.
 */
export function keepOrder<T extends { id: string }>(notes: T[], frozen: string[]): T[] {
  const at = new Map(frozen.map((id, i) => [id, i]));
  const fresh = notes.filter((n) => !at.has(n.id));
  const known = notes.filter((n) => at.has(n.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  return [...fresh, ...known];
}
