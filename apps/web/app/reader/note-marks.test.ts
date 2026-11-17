import type { Chapter, Note, NoteAnchor, NoteRef, Translation } from "@biblestdy/shared";
import * as vz from "@biblestdy/shared/versification";
import { describe, expect, it } from "vitest";
import { makeLocalizer } from "./localizer";
import { markReference, noteMarksInChapter as marksWith, notesOnVerse, noteTouchesChapter, writtenElsewhere, type NoteMark } from "./note-marks";

const translations: Translation[] = ["BPH", "WEB", "NIV"].map((a) => ({ id: a, abbreviation: a, name: a, language: a === "BPH" ? "da" : "en" }));
/** With the map loaded (the reader's steady state). */
const noteMarksInChapter = (notes: Note[], ch: Chapter) => marksWith(notes, ch, makeLocalizer(vz, translations, ch.translationId));

/** John 3 as BPH stores it: 14–15 is one bridge, stored under 14. */
const bph: Chapter = {
  translationId: "BPH",
  book: "JHN",
  chapter: 3,
  verses: [
    { verse: 13, text: "Ingen er steget op til himlen." },
    { verse: 14, label: "14–15", text: "Ligesom Moses løftede slangen op i ørkenen, sådan skal Menneskesønnen løftes op." },
    { verse: 16, text: "For så højt har Gud elsket verden." },
  ],
};
const web: Chapter = {
  ...bph,
  translationId: "WEB",
  verses: [
    { verse: 14, text: "As Moses lifted up the serpent in the wilderness," },
    { verse: 15, text: "that whoever believes in him should not perish." },
    { verse: 16, text: "For God so loved the world." },
  ],
};

const anchor = (over: Partial<NoteAnchor> = {}): NoteAnchor => ({
  id: "a1",
  translationId: "WEB",
  book: "JHN",
  chapter: 3,
  startVerse: 14,
  startWord: 2,
  endVerse: 15,
  endWord: 4,
  ...over,
});
const ref = (over: Partial<NoteRef> = {}): NoteRef => ({
  id: "r1",
  book: "JHN",
  chapter: 3,
  verse: 16,
  origin: "inline",
  position: 0,
  ...over,
});
const note = (over: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "The bronze serpent",
  body: "",
  anchors: [],
  refs: [],
  updatedAt: "2026-11-16T00:00:00Z",
  ...over,
});

describe("noteMarksInChapter (#159)", () => {
  it("keeps word-precise marks on the home translation", () => {
    const marks = noteMarksInChapter([note({ anchors: [anchor()] })], web);
    expect(marks).toEqual([
      expect.objectContaining({ id: "a1", noteId: "n1", startVerse: 14, startWord: 2, endVerse: 15, endWord: 4 }),
    ]);
    expect(marks[0].verseLevel).toBeUndefined();
  });

  it("marks another translation's anchor at verse level, through the bridge", () => {
    // WEB 3:14–15 in BPH: the whole 14–15 unit, never word-mapped
    const [m] = noteMarksInChapter([note({ anchors: [anchor()] })], bph);
    expect(m).toMatchObject({
      id: "a1",
      noteId: "n1",
      translationId: "BPH",
      startVerse: 14,
      startWord: 0,
      endVerse: 14,
      endWord: 11, // the bridge's last word (12 words)
      verseLevel: true,
    });
    // A verse inside the bridge lands on the bridge too
    const [m15] = noteMarksInChapter([note({ anchors: [anchor({ startVerse: 15, endVerse: 15 })] })], bph);
    expect(m15).toMatchObject({ startVerse: 14, endVerse: 14 });
  });

  it("marks inline refs at verse level in every translation", () => {
    for (const ch of [web, bph]) {
      const [m] = noteMarksInChapter([note({ refs: [ref()] })], ch);
      expect(m).toMatchObject({ id: "r1", startVerse: 16, endVerse: 16, startWord: 0, verseLevel: true });
    }
  });

  it("a cross-chapter or whole-chapter ref marks where it lands here", () => {
    const into = ref({ chapter: 2, verse: 20, endChapter: 3, endVerse: 13 });
    expect(noteMarksInChapter([note({ refs: [into] })], bph)[0]).toMatchObject({ startVerse: 13, endVerse: 13 });
    const whole = ref({ verse: undefined });
    expect(noteMarksInChapter([note({ refs: [whole] })], bph)[0]).toMatchObject({ startVerse: 13, endVerse: 16 });
  });

  it("one mark per verse unit per note; none beside its own word mark", () => {
    const n = note({
      anchors: [anchor({ startVerse: 16, endVerse: 16 }), anchor({ id: "a2", translationId: "NIV", startVerse: 16, endVerse: 16 })],
      refs: [ref(), ref({ id: "r2", verse: 14 }), ref({ id: "r3", verse: 15 })],
    });
    const web16 = noteMarksInChapter([n], web).map((m) => [m.id, m.startVerse, !!m.verseLevel]);
    expect(web16).toEqual([
      ["a1", 16, false],
      ["r2", 14, true],
      ["r3", 15, true],
    ]);
    // In BPH, 14 and 15 are one unit; WEB's and NIV's 16 one mark
    const bph16 = noteMarksInChapter([n], bph).map((m) => [m.id, m.startVerse]);
    expect(bph16).toEqual([
      ["a1", 16],
      ["r2", 14],
    ]);
  });

  it("nothing for a ref or anchor elsewhere, or verses this translation lacks", () => {
    const n = note({
      anchors: [anchor({ chapter: 4 }), anchor({ id: "a2", translationId: "NIV", startVerse: 40, endVerse: 40 })],
      refs: [ref({ book: "ROM" }), ref({ id: "r2", verse: 99 })],
    });
    expect(noteMarksInChapter([n], bph)).toEqual([]);
  });
});

describe("noteMarksInChapter maps versification (#163)", () => {
  const mal3: Chapter = {
    translationId: "BPH",
    book: "MAL",
    chapter: 3,
    verses: Array.from({ length: 24 }, (_, i) => ({ verse: i + 1, text: `vers ${i + 1}` })),
  };
  const mal4web: Chapter = {
    translationId: "WEB",
    book: "MAL",
    chapter: 4,
    verses: Array.from({ length: 6 }, (_, i) => ({ verse: i + 1, text: `verse ${i + 1}` })),
  };

  it("a ref stored as Mal 4:5 marks BPH Mal 3,23 — and WEB Mal 4:5", () => {
    const n = note({ refs: [ref({ book: "MAL", chapter: 4, verse: 5 })] });
    expect(noteMarksInChapter([n], mal3)).toEqual([expect.objectContaining({ startVerse: 23, endVerse: 23, verseLevel: true })]);
    expect(noteMarksInChapter([n], mal4web)).toEqual([expect.objectContaining({ startVerse: 5, verseLevel: true })]);
    // English Mal 3:5 is BPH 3,5 — no shift there
    expect(noteMarksInChapter([note({ refs: [ref({ book: "MAL", chapter: 3, verse: 5 })] })], mal3)[0]).toMatchObject({ startVerse: 5 });
  });

  it("anchors map between translations: WEB Mal 4:5 ↔ BPH Mal 3,23", () => {
    const inWeb = note({ anchors: [anchor({ book: "MAL", chapter: 4, startVerse: 5, endVerse: 5 })] });
    expect(noteMarksInChapter([inWeb], mal3)).toEqual([expect.objectContaining({ id: "a1", startVerse: 23, verseLevel: true })]);
    const inBph = note({ anchors: [anchor({ translationId: "BPH", book: "MAL", chapter: 3, startVerse: 23, endVerse: 23 })] });
    expect(noteMarksInChapter([inBph], mal4web)).toEqual([expect.objectContaining({ startVerse: 5, verseLevel: true })]);
    // BPH 3,1 is WEB 3:1: not in WEB Mal 4
    const early = note({ anchors: [anchor({ translationId: "BPH", book: "MAL", chapter: 3, startVerse: 1, endVerse: 1 })] });
    expect(noteMarksInChapter([early], mal4web)).toEqual([]);
  });

  it("before the map loads: home marks only, never a verse-level guess", () => {
    const n = note({
      anchors: [anchor({ translationId: "BPH", book: "MAL", chapter: 3, startVerse: 1, endVerse: 1 }), anchor({ id: "a2", book: "MAL", chapter: 3 })],
      refs: [ref({ book: "MAL", chapter: 4, verse: 5 })],
    });
    expect(marksWith([n], mal3, null).map((m) => m.id)).toEqual(["a1"]);
  });
});

describe("noteTouchesChapter / writtenElsewhere", () => {
  it("an anchor in any translation or an inline ref ties a note to the chapter", () => {
    expect(noteTouchesChapter(note({ anchors: [anchor({ translationId: "NIV" })] }), "JHN", 3)).toBe(true);
    expect(noteTouchesChapter(note({ refs: [ref()] }), "JHN", 3)).toBe(true);
    expect(noteTouchesChapter(note({ refs: [ref({ chapter: 2, verse: 1, endChapter: 4, endVerse: 1 })] }), "JHN", 3)).toBe(true);
    expect(noteTouchesChapter(note({ anchors: [anchor({ chapter: 4 })], refs: [ref({ book: "ROM" })] }), "JHN", 3)).toBe(false);
  });

  it("names the home translations only when none is the one being read", () => {
    const n = note({ anchors: [anchor(), anchor({ id: "a2", translationId: "NIV" }), anchor({ id: "a3", translationId: "BPH", chapter: 4 })] });
    expect(writtenElsewhere(n, "BPH", "JHN", 3)).toEqual(["WEB", "NIV"]);
    expect(writtenElsewhere(n, "WEB", "JHN", 3)).toEqual([]);
    expect(writtenElsewhere(note({ refs: [ref()] }), "BPH", "JHN", 3)).toEqual([]);
  });
});

describe("naming a link (#211)", () => {
  const m = (id: string, title: string, startVerse: number, endVerse: number, startWord = 0): NoteMark => ({
    id, noteId: id, title, translationId: "WEB", book: "JHN", chapter: 3, startVerse, startWord, endVerse, endWord: 3,
  });
  it("names its verses", () => {
    expect(markReference(m("a", "x", 14, 15))).toEqual({ book: "JHN", chapter: 3, verse: 14, endVerse: 15 });
    expect(markReference(m("a", "x", 16, 16))).toEqual({ book: "JHN", chapter: 3, verse: 16 });
  });
  it("lists a verse's notes once each, in text order, untitled named", () => {
    const marks = [m("b", "Born again", 16, 16, 4), m("a", "Serpent", 14, 16), m("c", "", 16, 16), m("b2", "Born again", 16, 16)];
    expect(notesOnVerse(marks, 16, "Untitled")).toEqual(["Serpent", "Untitled", "Born again"]);
    expect(notesOnVerse(marks, 13, "Untitled")).toEqual([]);
  });
});
