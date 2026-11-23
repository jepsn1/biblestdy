import type { Chapter, Highlight } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { pageMarks } from "../notes/page-marks";
import { bookFill, insertable, verseSuggestions } from "./verse-suggest";

const at = { translationId: "t", book: "JHN", chapter: 3 };
const hl = (id: string, verse: number): Highlight => ({
  ...at,
  id,
  color: "gold",
  startVerse: verse,
  startWord: 0,
  endVerse: verse,
  endWord: 2,
  quote: null,
});
const chapter = {
  ...at,
  verses: [
    { verse: 5, text: "Jesus answered, Most certainly I tell you" },
    { verse: 16, text: "For God so loved the world, that he gave" },
  ],
} as unknown as Chapter;
const marks = pageMarks([hl("a", 16), hl("b", 5)], [], chapter);

describe("verseSuggestions (#277 docked verse search)", () => {
  it("nothing typed: the open chapter's marks, in reading order", () => {
    const rows = verseSuggestions("", "en", marks);
    expect(rows.map((r) => r.key)).toEqual(["mark:bible:JHN.3.5", "mark:bible:JHN.3.16"]);
  });
  it("a whole reference leads, and is what Insert takes", () => {
    const rows = verseSuggestions("rom 8:28", "en", marks);
    expect(rows[0]).toMatchObject({ kind: "ref", ref: { book: "ROM", chapter: 8, verse: 28 } });
    expect(insertable(rows)?.key).toBe(rows[0].key);
  });
  it("Danish separators resolve too", () => {
    expect(verseSuggestions("rom 8,28", "da", [])[0]).toMatchObject({ kind: "ref", ref: { book: "ROM", chapter: 8 } });
  });
  it("a book name alone offers the book to fill in, which Insert doesn't take", () => {
    const rows = verseSuggestions("roma", "en", []);
    expect(rows.some((r) => r.kind === "book" && r.book === "ROM")).toBe(true);
    const onlyBooks = rows.filter((r) => r.kind === "book");
    expect(insertable(onlyBooks)).toBeNull();
    expect(bookFill("Romans")).toBe("Romans ");
  });
  it("a verse number picks the chapter's mark on it", () => {
    const rows = verseSuggestions("16", "en", marks);
    expect(rows.some((r) => r.kind === "mark" && r.mark.href === "bible:JHN.3.16")).toBe(true);
  });
  it("at most four rows", () => {
    expect(verseSuggestions("jo", "en", marks).length).toBeLessThanOrEqual(4);
  });
});
