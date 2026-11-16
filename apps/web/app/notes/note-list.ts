import {
  bookIndex,
  refsInMarkdown,
  resolveInChapter,
  toScriptureRef,
  wordRangeInVerse,
  words,
  type Anchor,
  type BookLocale,
  type Chapter,
  type Note,
  type NoteAnchor,
  type Reference,
  type ResolvedRange,
  type ScriptureRef,
} from "@biblestdy/shared";
import { referenceLabel } from "~/lib/reference-label";
import { plainText } from "~/lib/plain-text";

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
export function compareAnchors(
  a: Pick<Anchor, "book" | "chapter" | "startVerse" | "startWord">,
  b: Pick<Anchor, "book" | "chapter" | "startVerse" | "startWord">,
): number {
  return (
    bookIndex(a.book) - bookIndex(b.book) ||
    a.chapter - b.chapter ||
    a.startVerse - b.startVerse ||
    a.startWord - b.startWord
  );
}

/** Bible order of a reference against an anchor-shaped place (a whole
 * chapter sorts before its verses). */
function placeOf(r: ScriptureRef): Pick<Anchor, "book" | "chapter" | "startVerse" | "startWord"> {
  return { book: r.book, chapter: r.chapter, startVerse: r.verse ?? 0, startWord: 0 };
}

/** One row of a note's references overview (#161). */
export type OverviewRow =
  | { kind: "text"; key: string; ref: ScriptureRef }
  | { kind: "marked"; key: string; anchor: NoteAnchor };

/**
 * A note's references overview (#161): the references in its text, in
 * text order, each once (the live body: no wait for the save), then the
 * reader selections in Bible order.
 */
export function overviewRows(body: string, anchors: readonly NoteAnchor[]): OverviewRow[] {
  const text = refsInMarkdown(body).map(
    (ref): OverviewRow => ({ kind: "text", key: `t:${ref.book}.${ref.chapter}.${ref.verse ?? ""}-${ref.endChapter ?? ""}.${ref.endVerse ?? ""}`, ref }),
  );
  const marked = [...anchors].sort(compareAnchors).map((anchor): OverviewRow => ({ kind: "marked", key: `m:${anchor.id}`, anchor }));
  return [...text, ...marked];
}

/** Where a row's snippet comes from: whole-verse refs quote the reading
 * translation, word-precise anchors their home translation. */
export type SnippetChapter = { translationId: string; book: string; chapter: number };

export function snippetChapterOf(row: OverviewRow, readingId: string | undefined): SnippetChapter | null {
  if (row.kind === "marked") return { translationId: row.anchor.translationId, book: row.anchor.book, chapter: row.anchor.chapter };
  return readingId ? { translationId: readingId, book: row.ref.book, chapter: row.ref.chapter } : null;
}

export const chapterKey = (c: SnippetChapter) => `${c.translationId}/${c.book}/${c.chapter}`;

/** Snippets are fetched for this many distinct chapters at most (quota,
 * FUMS); rows beyond show the label and "Show text". */
export const SNIPPET_CHAPTER_CAP = 10;

/**
 * The chapters the overview fetches for its snippets: distinct, in row
 * order, the first `cap` of them, plus any the reader asked for ("Show
 * text").
 */
export function snippetChapters(
  rows: readonly OverviewRow[],
  readingId: string | undefined,
  { cap = SNIPPET_CHAPTER_CAP, asked = new Set<string>() }: { cap?: number; asked?: ReadonlySet<string> } = {},
): SnippetChapter[] {
  const seen = new Map<string, SnippetChapter>();
  const out: SnippetChapter[] = [];
  for (const row of rows) {
    const c = snippetChapterOf(row, readingId);
    if (!c) continue;
    const key = chapterKey(c);
    if (seen.has(key)) continue;
    seen.set(key, c);
    if (seen.size <= cap || asked.has(key)) out.push(c);
  }
  return out;
}

/** A snippet cut on a word boundary, ending in "…" when cut. */
export function cutSnippet(text: string, max = 90): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  const space = head.lastIndexOf(" ");
  // One very long word: cut it rather than show nothing
  const cut = space > max / 3 ? head.slice(0, space) : s.slice(0, max);
  return `${cut.replace(/[\s,;:.\u2013\u2014-]+$/u, "")}…`;
}

/** The words an anchor covers (its home translation's chapter). */
export function anchorSnippet(chapter: Chapter, a: Anchor, max?: number): string {
  const covered: string[] = [];
  for (const v of chapter.verses) {
    const tokens = words(v.text);
    const r = wordRangeInVerse(a, v.verse, tokens.length);
    if (r) covered.push(...tokens.slice(r.start, r.end + 1));
  }
  return cutSnippet(covered.join(" "), max);
}

/**
 * A whole-verse reference's snippet in a chapter of some translation: the
 * verses it resolves to (a bridge whole), cut; `notInTranslation` when the
 * translation lacks them — never a neighbour. `chapter` null = a 404.
 */
export function refSnippet(
  ref: ScriptureRef,
  chapter: Chapter | null,
  max?: number,
): { text: string; at: ResolvedRange } | "notInTranslation" {
  const at = resolveInChapter(ref, chapter);
  if (!at || at === "notInTranslation" || !chapter) return "notInTranslation";
  const text = chapter.verses
    .filter((v) => v.verse >= at.startVerse && v.verse <= at.endVerse)
    .map((v) => v.text)
    .join(" ");
  return { text: cutSnippet(text, max), at };
}

/** Every reference a note has, as one list (overview order) — for the
 * Notes page's rows, search and Bible order. */
export function noteRefLabels(note: Pick<Note, "body" | "anchors">, bookName: (id: string) => string, locale: BookLocale): string[] {
  return overviewRows(note.body, note.anchors).map((r) =>
    r.kind === "text" ? referenceLabel(r.ref, bookName, locale) : anchorLabel(r.anchor, bookName, locale),
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
 * by first reference (in the text or marked), notes without any last.
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
        ...noteRefLabels(n, bookName, locale),
        ...n.anchors.map((a) => `${a.book} ${a.chapter}:${a.startVerse}`),
        ...refsInMarkdown(n.body).map((r) => `${r.book} ${r.chapter}:${r.verse ?? ""}`),
        ...(n.tags ?? []).map((t) => t.name),
      ].join(" \n "),
    );
    return terms.every((t) => hay.includes(t));
  });
  if (sort === "recent") return hits;
  // First place a note cites — in its text or marked in the Bible
  const first = (n: Note) => [...n.anchors, ...refsInMarkdown(n.body).map(placeOf)].sort(compareAnchors)[0];
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
 * A verse inside a bridge takes the whole bridge (BPH John 3:15 is stored
 * under 14 as "14–15"), a range past the chapter's end stops at its last
 * verse (the shared resolver, #158). An anchor sits in one chapter, so a
 * range into the next is refused.
 */
export function anchorForReference(ref: Reference, chapter: Chapter): Anchor | ReferenceProblem {
  if (ref.chapter === undefined) return "noChapter";
  if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) return "crossChapter";
  const asked = toScriptureRef(ref);
  const at = asked && resolveInChapter(asked, chapter);
  if (!at || at === "notInTranslation") return "noVerse";
  const end = chapter.verses.find((v) => v.verse === at.endVerse);
  if (!end) return "noVerse";
  return {
    translationId: chapter.translationId,
    book: chapter.book,
    chapter: chapter.chapter,
    startVerse: at.startVerse,
    startWord: 0,
    endVerse: at.endVerse,
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
