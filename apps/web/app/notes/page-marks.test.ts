import type { Annotation, Chapter, Highlight } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { filterMarks, pageMarks } from "./page-marks";

const at = { translationId: "t", book: "JHN", chapter: 3 };
const hl = (id: string, sv: number, sw: number, ev: number, ew: number, color: Highlight["color"] = "gold", quote: string | null = null): Highlight => ({
  ...at,
  id,
  color,
  startVerse: sv,
  startWord: sw,
  endVerse: ev,
  endWord: ew,
  quote,
});
const pen = (id: string, sv: number, ev: number, mark: Annotation["mark"] = null, text: string | null = null): Annotation => ({
  ...at,
  id,
  text,
  mark,
  startVerse: sv,
  startWord: 0,
  endVerse: ev,
  endWord: 2,
  quote: null,
});
const chapter = {
  ...at,
  verses: [
    { verse: 16, text: "For God so loved the world, that he gave" },
    { verse: 17, text: "For God sent not his Son into the world" },
    { verse: 18, text: "He that believeth on him is not condemned" },
  ],
} as unknown as Chapter;

describe("pageMarks", () => {
  it("lists highlights and pen marks in reading order, as canonical chips", () => {
    const marks = pageMarks([hl("a", 18, 0, 18, 3), hl("b", 16, 2, 16, 4, "blue")], [pen("c", 17, 17, "underline")], chapter);
    expect(marks.map((m) => m.href)).toEqual(["bible:JHN.3.16", "bible:JHN.3.17", "bible:JHN.3.18"]);
    expect(marks[0].kinds).toEqual([{ type: "highlight", color: "blue" }]);
    expect(marks[1].kinds).toEqual([{ type: "pen", mark: "underline", text: false }]);
  });
  it("a range over verses is the passage, not its first verse", () => {
    const [m] = pageMarks([hl("a", 16, 0, 18, 1)], [], chapter);
    expect(m.href).toBe("bible:JHN.3.16-18");
  });
  it("the snippet is the marked words: the quote, else cut from the text", () => {
    expect(pageMarks([hl("a", 16, 2, 16, 4)], [], chapter)[0].snippet).toBe("so loved the");
    expect(pageMarks([hl("a", 16, 2, 16, 4, "gold", "so loved thee")], [], chapter)[0].snippet).toBe("so loved thee");
    expect(pageMarks([hl("a", 16, 0, 17, 8)], [], chapter, undefined, 4)[0].snippet).toBe("For God so loved…");
    expect(pageMarks([hl("a", 16, 0, 16, 1)], [], undefined)[0].snippet).toBe("");
  });
  it("one passage marked twice is one row with both kinds", () => {
    const marks = pageMarks([hl("a", 16, 0, 16, 3)], [pen("b", 16, 16, "circle", "love!")], chapter);
    expect(marks).toHaveLength(1);
    expect(marks[0].kinds).toHaveLength(2);
    expect(marks[0].kinds).toEqual(
      expect.arrayContaining([
        { type: "highlight", color: "gold" },
        { type: "pen", mark: "circle", text: true },
      ]),
    );
  });
  it("each row tags one mark: its first highlight, else its first pen mark (#216)", () => {
    const [both] = pageMarks([hl("h", 16, 0, 16, 3)], [pen("p", 16, 16, "circle")], chapter);
    expect(both.mark).toEqual({ kind: "highlight", id: "h" });
    const [penOnly] = pageMarks([], [pen("p", 17, 17, "underline")], chapter);
    expect(penOnly.mark).toEqual({ kind: "annotation", id: "p" });
  });
  it("maps the translation's numbering to canonical; no counterpart, no row", () => {
    const marks = pageMarks([hl("a", 16, 0, 16, 1), hl("b", 17, 0, 17, 1)], [], chapter, (r) =>
      r.verse === 17 ? null : { ...r, chapter: 4, verse: 2 },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ href: "bible:JHN.4.2", local: { chapter: 3, verse: 16 } });
  });
});

describe("filterMarks", () => {
  const marks = pageMarks([hl("a", 16, 0, 16, 4, "gold"), hl("b", 18, 0, 18, 3, "green")], [pen("c", 17, 17, "underline")], chapter);
  const describe_ = (m: (typeof marks)[number]) => m.kinds.map((k) => (k.type === "highlight" ? `highlight ${k.color}` : `pen ${k.mark}`)).join(" ");
  const hrefs = (q: string) => filterMarks(marks, q, "da", describe_).map((m) => m.href);

  it("nothing typed: every mark", () => {
    expect(hrefs("")).toHaveLength(3);
  });
  it("a verse number, or chapter and verse", () => {
    expect(hrefs("17")).toEqual(["bible:JHN.3.17"]);
    expect(hrefs("3,18")).toEqual(["bible:JHN.3.18"]);
    expect(hrefs("4,18")).toEqual([]);
  });
  it("a reference the mark overlaps", () => {
    expect(hrefs("joh 3,16-17")).toEqual(["bible:JHN.3.16", "bible:JHN.3.17"]);
    expect(hrefs("joh 3")).toHaveLength(3);
    expect(hrefs("rom 8,28")).toEqual([]);
  });
  it("words of the marked text or kind, accents and case aside", () => {
    expect(hrefs("GOD so")).toEqual(["bible:JHN.3.16"]);
    expect(hrefs("green")).toEqual(["bible:JHN.3.18"]);
    expect(hrefs("underline")).toEqual(["bible:JHN.3.17"]);
    expect(hrefs("lóved")).toEqual(["bible:JHN.3.16"]);
    expect(hrefs("xyzzy")).toEqual([]);
  });
});
