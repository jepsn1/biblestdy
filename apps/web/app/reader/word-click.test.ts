import { describe, expect, it } from "vitest";
import { anchorOf, eraseClick, notesAtWord, notesInStroke, wordClick } from "./word-click";

const base = { translationId: "web", book: "JHN", chapter: 3 };
const span = (sv: number, sw: number, ev: number, ew: number) => ({
  ...base,
  startVerse: sv,
  startWord: sw,
  endVerse: ev,
  endWord: ew,
});
const note = (id: string, noteId: string, title: string, s: ReturnType<typeof span>, verseLevel = false) => ({
  ...s,
  id,
  noteId,
  title,
  verseLevel,
});
const pen = { id: "p1", text: null };
const written = { id: "a1", text: "Look here" };
const gold = { id: "h1", color: "gold" };

describe("notesAtWord", () => {
  const marks = [
    note("x", "n1", "Bronze serpent", span(14, 0, 15, 9)),
    note("y", "n2", "Born again", span(14, 2, 14, 4)),
    note("z", "n1", "Bronze serpent", span(14, 0, 14, 12), true),
  ];
  it("lists each note once, the most specific link first", () => {
    expect(notesAtWord(marks, { verse: 14, word: 3 }).map((n) => n.noteId)).toEqual(["n2", "n1"]);
  });
  it("misses words outside every link", () => {
    expect(notesAtWord(marks, { verse: 16, word: 0 })).toEqual([]);
  });
});

describe("wordClick (C3)", () => {
  const one = [{ noteId: "n1", title: "Bronze serpent", verseLevel: false }];
  const verse = [{ noteId: "n3", title: "God so loved", verseLevel: true }];

  it("a word with only a note link opens that note", () => {
    expect(wordClick({ annotation: null, highlight: null, notes: one })).toEqual({ kind: "openNote", noteId: "n1" });
  });
  it("a highlight under a note link opens the highlight's menu, with the note as a row", () => {
    expect(wordClick({ annotation: null, highlight: gold, notes: one })).toEqual({
      kind: "highlightMenu",
      highlight: gold,
      notes: [{ noteId: "n1", title: "Bronze serpent" }],
    });
  });
  it("a pen mark under a note link opens the mark's menu, with the note as a row", () => {
    expect(wordClick({ annotation: pen, highlight: gold, notes: one })).toMatchObject({
      kind: "markMenu",
      annotation: pen,
      notes: [{ noteId: "n1" }],
    });
  });
  it("a margin note with text focuses its box; linked too, it offers the choice", () => {
    expect(wordClick({ annotation: written, highlight: null, notes: [] })).toEqual({
      kind: "focusAnnotation",
      annotation: written,
    });
    expect(wordClick({ annotation: written, highlight: null, notes: one })).toMatchObject({
      kind: "notes",
      annotation: written,
    });
  });
  it("two notes on bare words: a list to pick from", () => {
    expect(wordClick({ annotation: null, highlight: null, notes: [...one, ...verse] })).toMatchObject({
      kind: "notes",
      notes: [{ noteId: "n1" }, { noteId: "n3" }],
    });
  });
  it("phones: a whole-verse link alone leaves the tap to tap-select, but still rows in a menu", () => {
    const opts = { verseLinksOpen: false };
    expect(wordClick({ annotation: null, highlight: null, notes: verse }, opts)).toEqual({ kind: "none" });
    expect(wordClick({ annotation: null, highlight: null, notes: [...verse, ...one] }, opts)).toEqual({
      kind: "openNote",
      noteId: "n1",
    });
    expect(wordClick({ annotation: null, highlight: gold, notes: verse }, opts)).toMatchObject({
      kind: "highlightMenu",
      notes: [{ noteId: "n3" }],
    });
  });
  it("plain words: nothing", () => {
    expect(wordClick({ annotation: null, highlight: null, notes: [] })).toEqual({ kind: "none" });
  });
});

describe("eraseClick", () => {
  const one = [{ noteId: "n1", title: "Bronze serpent", verseLevel: false }];
  it("erases the reader's ink even under a note link", () => {
    expect(eraseClick({ annotation: pen, highlight: gold, notes: one })).toEqual({ kind: "annotation", annotation: pen });
    expect(eraseClick({ annotation: null, highlight: gold, notes: one })).toEqual({ kind: "highlight", highlight: gold });
  });
  it("never erases a link: a hint names the note", () => {
    expect(eraseClick({ annotation: null, highlight: null, notes: one })).toEqual({
      kind: "hint",
      notes: [{ noteId: "n1", title: "Bronze serpent" }],
    });
  });
  it("plain words: nothing", () => {
    expect(eraseClick({ annotation: null, highlight: null, notes: [] })).toEqual({ kind: "none" });
  });
});

describe("notesInStroke", () => {
  it("finds the notes a stroke crosses, once each", () => {
    const marks = [
      note("x", "n1", "A", span(14, 0, 14, 5)),
      note("y", "n1", "A", span(16, 0, 16, 3)),
      note("z", "n2", "B", span(17, 0, 17, 3)),
    ];
    expect(notesInStroke(marks, span(14, 4, 16, 1))).toEqual([{ noteId: "n1", title: "A" }]);
    expect(notesInStroke(marks, span(15, 0, 15, 3))).toEqual([]);
  });
});

describe("anchorOf", () => {
  it("keeps only the anchor's fields", () => {
    expect(anchorOf({ ...span(3, 1, 3, 2), id: "h1", color: "gold" } as never)).toEqual(span(3, 1, 3, 2));
  });
});
