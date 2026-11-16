import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageSpan, placeSelector, reflowPage, type Place } from "./reading-place";

/**
 * A chapter as words in reading order, laid out by a page size: two columns
 * (12 words a spread) or one (the note panel open, 5 words a page). Verse 3
 * runs over the spread break, like John 3:18.
 */
const words: Place[] = [
  ...[0, 1, 2, 3, 4].map((word) => ({ verse: 1, word })),
  ...[0, 1, 2, 3, 4].map((word) => ({ verse: 2, word })),
  ...[0, 1, 2, 3, 4, 5].map((word) => ({ verse: 3, word })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((word) => ({ verse: 4, word })),
];
const layout = (perPage: number) => {
  const pageOf = (p: Place) => Math.floor(words.findIndex((w) => w.verse === p.verse && w.word === p.word) / perPage);
  return {
    pageOf,
    count: Math.ceil(words.length / perPage),
    span: (page: number) => pageSpan(words.map((w) => ({ ...w, page: pageOf(w) })), page),
  };
};
const spread = layout(12);
const column = layout(5);
/** The effect's restore step: the page that now holds the place. */
const restore = (place: Place, to: ReturnType<typeof layout>, page: number) =>
  reflowPage(to.pageOf(place), page, to.count) ?? page;

describe("pageSpan", () => {
  it("gives the folio range and the page's first word, mid-verse when a verse runs over", () => {
    expect(spread.span(1)).toEqual({ first: { verse: 3, word: 2 }, lastVerse: 4 });
    expect(spread.span(0)).toEqual({ first: { verse: 1, word: 0 }, lastVerse: 3 });
    expect(spread.span(9)).toBeNull();
  });
});

describe("reflowPage", () => {
  it("turns to the place's page, clamped; null to stay", () => {
    expect(reflowPage(3, 1, 5)).toBe(3);
    expect(reflowPage(7, 1, 5)).toBe(4);
    expect(reflowPage(1, 1, 5)).toBeNull();
    expect(reflowPage(null, 1, 5)).toBeNull();
  });
});

describe("opening a note keeps its passage (#203)", () => {
  // Spread 2 (page 1) starts inside verse 3; the note's mark is on verse 4
  const mark: Place = { verse: 4, word: 3 };
  const place = spread.span(1)!.first;

  it("the old place (the spread's first word) lands on another page than the mark", () => {
    expect(restore(place, column, 1)).not.toBe(column.pageOf(mark));
  });

  it("the mark as the place: open shows it, close returns to the same spread", () => {
    const open = restore(mark, column, 1);
    expect(open).toBe(column.pageOf(mark));
    expect(restore(mark, spread, open)).toBe(1);
  });

  it("a word place never turns back a page: verse-only (word 0) would", () => {
    expect(restore(place, spread, restore(place, column, 1))).toBe(1);
    expect(restore({ verse: place.verse, word: 0 }, spread, 1)).toBe(0);
  });

  it("selects the word's element", () => {
    expect(placeSelector(mark)).toBe('[data-verse="4"][data-word="3"]');
  });
});

/** Guard: every way the page opens a note from its mark hands the reader's
 * place along — a bare onOpenNote(id) brings the bug back. */
describe("note openers on the page pass their place", () => {
  const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  it.each(["./chapter-text.tsx", "./annotation-marks.tsx"])("%s", (file) => {
    const calls = [...src(file).matchAll(/\bonOpenNote\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(args, `onOpenNote(${args})`).toMatch(/,\s*\{\s*verse:/);
  });
  it("the reader wires them to openNoteAt", () => {
    const text = src("./paginated-chapter.tsx");
    expect(text).toMatch(/<ChapterText[\s\S]*?onOpenNote=\{openNoteAt\}/);
    expect(text).toMatch(/<AnnotationMarks[\s\S]*?onOpenNote=\{openNoteAt\}/);
  });
});
