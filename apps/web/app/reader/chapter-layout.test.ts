import type { Chapter } from "@biblestdy/shared";
import { words } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { layoutChapter, type LaidBlock } from "./chapter-layout";

const base = { translationId: "T", book: "PSA", chapter: 23 };

/** Every (verse, word) rendered exactly once, in order, with its full text. */
function renderedWords(blocks: LaidBlock[]) {
  const seen: { verse: number; i: number; text: string }[] = [];
  for (const b of blocks)
    for (const p of b.pieces)
      for (const w of p.words) {
        const last = seen[seen.length - 1];
        // A cut word continues in the next block: glue it back
        if (last && last.verse === p.verse.verse && last.i === w.i) last.text += w.text;
        else seen.push({ verse: p.verse.verse, i: w.i, text: w.text });
      }
  return seen;
}

function allWords(chapter: Chapter) {
  return chapter.verses.flatMap((v) => words(v.text).map((text, i) => ({ verse: v.verse, i, text })));
}

const lines = (blocks: LaidBlock[]) =>
  blocks.map((b) =>
    b.pieces
      .flatMap((p) => p.words.map((w) => w.text))
      .join(" "),
  );

describe("layoutChapter", () => {
  it("no blocks: one continuous flow, every word once (legacy look)", () => {
    const chapter: Chapter = {
      ...base,
      verses: [
        { verse: 1, text: "a b" },
        { verse: 2, text: "c" },
      ],
    };
    const out = layoutChapter(chapter);
    expect(out).toHaveLength(1);
    expect(out[0].opening).toBe(true);
    expect(renderedWords(out)).toEqual(allWords(chapter));
  });

  it("headings open an unindented block; verse numbers only at verse starts", () => {
    const chapter: Chapter = {
      ...base,
      verses: [
        { verse: 1, text: "a b c" },
        { verse: 2, text: "d e" },
        { verse: 3, text: "f" },
      ],
      sections: [
        { beforeVerse: 1, title: "One" },
        { beforeVerse: 3, title: "Two" },
      ],
      blocks: [
        { verse: 1, word: 0, kind: "paragraph" },
        { verse: 1, word: 2, kind: "paragraph" },
        { verse: 3, word: 0, kind: "paragraph" },
      ],
    };
    const out = layoutChapter(chapter);
    expect(lines(out)).toEqual(["a b", "c d e", "f"]);
    expect(out.map((b) => b.headings)).toEqual([["One"], [], ["Two"]]);
    expect(out.map((b) => b.opening)).toEqual([true, false, true]);
    expect(out[1].pieces.map((p) => [p.verse.verse, p.showNumber])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(renderedWords(out)).toEqual(allWords(chapter));
  });

  it("poetry break inside a joined word splits it visually, keeps one word index", () => {
    // NIV Ps 23:2 as API.Bible serves it: "pastures," + "he" with no space
    const chapter: Chapter = {
      ...base,
      verses: [{ verse: 2, text: "green pastures,he leads me" }],
      blocks: [
        { verse: 2, word: 0, kind: "poetry", level: 2 },
        { verse: 2, word: 1, char: 9, kind: "poetry", level: 1 },
      ],
    };
    const out = layoutChapter(chapter);
    expect(lines(out)).toEqual(["green pastures,", "he leads me"]);
    expect(out.map((b) => [b.kind, b.level])).toEqual([
      ["poetry", 2],
      ["poetry", 1],
    ]);
    expect(out[0].pieces[0].words[1]).toEqual({ i: 1, text: "pastures,", cut: true });
    expect(out[1].pieces[0]).toMatchObject({ showNumber: false, words: [{ i: 1, text: "he", cut: false }, {}, {}] });
    expect(renderedWords(out)).toEqual(allWords(chapter));
  });

  it("stanza flag and bridge label pass through", () => {
    const chapter: Chapter = {
      ...base,
      verses: [
        { verse: 13, text: "x" },
        { verse: 14, label: "14–15", text: "y z" },
      ],
      blocks: [
        { verse: 13, word: 0, kind: "poetry", level: 1 },
        { verse: 14, word: 0, kind: "poetry", level: 1, stanza: true },
      ],
    };
    const out = layoutChapter(chapter);
    expect(out.map((b) => b.stanza)).toEqual([false, true]);
    expect(out[1].pieces[0].verse.label).toBe("14–15");
  });

  it("ignores out-of-range blocks instead of losing words", () => {
    const chapter: Chapter = {
      ...base,
      verses: [{ verse: 1, text: "a b" }],
      blocks: [
        { verse: 1, word: 9, kind: "paragraph" },
        { verse: 7, word: 0, kind: "paragraph" },
        { verse: 1, word: 1, char: 5, kind: "poetry" },
      ],
    };
    const out = layoutChapter(chapter);
    expect(renderedWords(out)).toEqual(allWords(chapter));
    expect(lines(out)).toEqual(["a", "b"]);
  });
});
