import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverInto, spanSize } from "./mark-coverage";
import { markStartSelector, noteMarkId, spotlitWords } from "./spotlight";

const passage = { translationId: "WEB", book: "GEN", chapter: 1 };
const verses = [
  { verse: 1, text: "In the beginning, God created the heavens and the earth." }, // 10 words
  { verse: 2, text: "The earth was formless and empty." }, // 6 words
  { verse: 3, text: "God said, “Let there be light,” and there was light." },
];
const ref = { ...passage, noteId: "a", id: "r1", startVerse: 1, startWord: 0, endVerse: 2, endWord: 3 };
// Another note's reference over some of the same words (smaller: it wins
// the click coverage there)
const other = { ...passage, noteId: "b", id: "r2", startVerse: 1, startWord: 7, endVerse: 1, endWord: 8 };

const all = (from: [number, number], to: [number, number]) => {
  const out: string[] = [];
  for (const v of verses) {
    const n = v.text.split(/\s+/).length;
    for (let w = 0; w < n; w++)
      if ((v.verse > from[0] || (v.verse === from[0] && w >= from[1])) && (v.verse < to[0] || (v.verse === to[0] && w <= to[1])))
        out.push(`${v.verse}:${w}`);
  }
  return out;
};

describe("spotlitWords", () => {
  it("lights every word of the selected reference, whatever else marks them", () => {
    const lit = spotlitWords(verses, [ref, other], noteMarkId(ref));
    expect([...lit].sort()).toEqual(all([1, 0], [2, 3]).sort());
    // the other note's words inside it are lit too — no muted hole
    expect(lit.has("1:7") && lit.has("1:8")).toBe(true);
    // a mark straddling the end: only the reference's part is lit
    expect(lit.has("2:3")).toBe(true);
    expect(lit.has("2:4")).toBe(false);
  });

  it("lights only the smaller reference when that one is selected", () => {
    expect([...spotlitWords(verses, [ref, other], noteMarkId(other))]).toEqual(["1:7", "1:8"]);
  });

  it("lights nothing without a selected reference here", () => {
    expect(spotlitWords(verses, [ref], null).size).toBe(0);
    expect(spotlitWords(verses, [ref], "note:x:y").size).toBe(0);
  });
});

describe("spotlight styling", () => {
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  const src = readFileSync(new URL("./chapter-text.tsx", import.meta.url), "utf8");

  it("keys full ink on the word itself, never on a mark's wrapper span", () => {
    expect(css).toMatch(/\[data-spotlight\] \[data-word\]\[data-spotlit\]/);
    expect(css).not.toMatch(/\[data-spotlit\]\s+\[data-word\]/);
    // the wrapper only exists for the mark that won a word's coverage
    expect(src).not.toMatch(/data-spotlit=\{seg\./);
  });
});

describe("markStartSelector", () => {
  // A reference wholly covered by smaller marks (a pen underline + another
  // note): smallest-first coverage gives it no word, so no wrapper span of
  // its own is rendered — the jump must still find it
  const covered = { ...passage, noteId: "a", id: "r3", startVerse: 2, startWord: 0, endVerse: 2, endWord: 3 };
  const pen = { ...passage, id: "pen", startVerse: 2, startWord: 0, endVerse: 2, endWord: 1 };
  const small = { ...passage, noteId: "b", id: "r4", startVerse: 2, startWord: 2, endVerse: 2, endWord: 3 };

  it("finds a reference that owns no word of the coverage", () => {
    const coverage = new Map<string, string>();
    coverInto(
      coverage,
      verses,
      [
        { ...pen, value: pen.id },
        ...[covered, small].map((m) => ({ ...m, value: noteMarkId(m) })),
      ].sort((a, b) => spanSize(a) - spanSize(b)),
    );
    expect([...coverage.values()]).not.toContain(noteMarkId(covered));
    expect(markStartSelector([covered, small], noteMarkId(covered))).toBe('[data-verse="2"][data-word="0"]');
  });

  it("is null until the mark is known (notes still loading)", () => {
    expect(markStartSelector([], noteMarkId(covered))).toBeNull();
  });

  it("the reader looks references up by word, not by wrapper span", () => {
    const reader = readFileSync(new URL("./paginated-chapter.tsx", import.meta.url), "utf8");
    expect(reader).not.toMatch(/data-annotation-anchor/);
  });
});
