import { describe, expect, it } from "vitest";
import { bookName, parseReference, type Chapter, type Note } from "@biblestdy/shared";
import {
  anchorForReference,
  anchorLabel,
  cutSnippet,
  filterNotes,
  keepOrder,
  noteRefLabels,
  noteTitle,
  overviewRows,
  referenceLabel,
  refSnippet,
  snippetChapters,
} from "./note-list";

const T = "2026-11-01T00:00:00.000Z";
const anchor = (book: string, chapter: number, startVerse: number, endVerse = startVerse) => ({
  id: `${book}${chapter}${startVerse}`,
  translationId: "WEB",
  book,
  chapter,
  startVerse,
  startWord: 0,
  endVerse,
  endWord: 3,
});
const note = (id: string, over: Partial<Note>): Note => ({ id, title: "", body: "", anchors: [], refs: [], updatedAt: T, ...over });
const da = (id: string) => bookName(id, "da");
const en = (id: string) => bookName(id, "en");

describe("noteTitle", () => {
  it("is the title when there is one", () => {
    expect(noteTitle({ title: " Grace ", body: "x" }, "Untitled")).toBe("Grace");
  });
  it("falls back to the first written line, markdown stripped", () => {
    expect(noteTitle({ title: "", body: "\n\n## Born **anew**\nmore" }, "Untitled")).toBe("Born anew");
  });
  it("is the untitled label for an empty note", () => {
    expect(noteTitle({ title: "", body: "  \n" }, "Untitled")).toBe("Untitled");
  });
});

describe("anchorLabel", () => {
  it("speaks the UI language: Danish names and comma", () => {
    expect(anchorLabel(anchor("JHN", 3, 16, 18), da, "da")).toBe("Johannes 3,16–18");
    expect(anchorLabel(anchor("ROM", 5, 8), en, "en")).toBe("Romans 5:8");
  });
});

describe("referenceLabel", () => {
  it.each([
    ["da", "chapter", { book: "JHN", chapter: 3 }, "Johannes 3"],
    ["da", "single verse", { book: "JHN", chapter: 3, verse: 16 }, "Johannes 3,16"],
    ["da", "range", { book: "JHN", chapter: 3, verse: 14, endVerse: 15 }, "Johannes 3,14–15"],
    ["da", "cross-chapter range", { book: "JHN", chapter: 3, verse: 36, endChapter: 4, endVerse: 2 }, "Johannes 3,36–4,2"],
    ["da", "book only", { book: "GEN" }, "1 Mosebog"],
    ["en", "chapter", { book: "JHN", chapter: 3 }, "John 3"],
    ["en", "single verse", { book: "JHN", chapter: 3, verse: 16 }, "John 3:16"],
    ["en", "range", { book: "JHN", chapter: 3, verse: 14, endVerse: 15 }, "John 3:14–15"],
    ["en", "cross-chapter range", { book: "JHN", chapter: 3, verse: 36, endChapter: 4, endVerse: 2 }, "John 3:36–4:2"],
    ["en", "book only", { book: "GEN" }, "Genesis"],
  ] as const)("%s %s", (locale, _, ref, want) => {
    expect(referenceLabel(ref, locale === "da" ? da : en, locale)).toBe(want);
  });
  it("round-trips through the passage parser (palette, add reference)", () => {
    for (const label of ["Johannes 3,16", "Johannes 3,14–15", "Johannes 3,36–4,2", "1 Mosebog 1"]) {
      const ref = parseReference(label, "da");
      expect(ref && referenceLabel(ref, da, "da")).toBe(label);
    }
    for (const label of ["John 3:16", "John 3:14–15", "1 John 2:1"]) {
      const ref = parseReference(label, "en");
      expect(ref && referenceLabel(ref, en, "en")).toBe(label);
    }
  });
  it("one psalm is singular, the book plural", () => {
    expect(referenceLabel({ book: "PSA", chapter: 23 }, da, "da")).toBe("Salme 23");
    expect(referenceLabel({ book: "PSA", chapter: 23, verse: 1 }, en, "en")).toBe("Psalm 23:1");
    expect(referenceLabel({ book: "PSA" }, da, "da")).toBe("Salmerne");
    expect(referenceLabel({ book: "JAS", chapter: 1 }, da, "da")).toBe("Jakobsbrevet 1");
    expect(referenceLabel({ book: "JUD", chapter: 1, verse: 3 }, da, "da")).toBe("Judasbrevet 1,3");
    for (const label of ["Salme 23,1", "Jakobsbrevet 1", "Judasbrevet 1,3"]) {
      const ref = parseReference(label, "da");
      expect(ref && referenceLabel(ref, da, "da")).toBe(label);
    }
    expect(parseReference("Jakobsbrev 1", "da")).toEqual({ book: "JAS", chapter: 1 });
  });
  it("a one-verse range reads as the verse", () => {
    expect(referenceLabel({ book: "PSA", chapter: 23, verse: 1, endVerse: 1 }, da, "da")).toBe("Salme 23,1");
  });
});

describe("filterNotes", () => {
  const notes = [
    note("a", { title: "Sermon: God so loved", anchors: [anchor("JHN", 3, 16), anchor("ROM", 5, 8)], tags: [{ id: "t1", name: "nåde" }] }),
    note("b", { title: "In the beginning", body: "John 1 echoes this", anchors: [anchor("GEN", 1, 1)] }),
    note("c", { title: "Draft", body: "no passages yet" }),
  ];
  const base = { query: "", topic: null, sort: "recent" as const, bookName: da, locale: "da" as const };

  it("finds and orders notes by the references in their text too", () => {
    const withInline = [...notes, note("d", { title: "Psalm", body: "See [Sl 23,1](bible:PSA.23.1)" })];
    expect(filterNotes(withInline, { ...base, query: "salme 23" }).map((n) => n.id)).toEqual(["d"]);
    expect(filterNotes(withInline, { ...base, sort: "bible" }).map((n) => n.id)).toEqual(["b", "d", "a", "c"]);
  });
  it("keeps the API's order (last edit first) with no filter", () => {
    expect(filterNotes(notes, base).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  it("finds words in title and text, every word, accents folded", () => {
    expect(filterNotes(notes, { ...base, query: "echoes JOHN" }).map((n) => n.id)).toEqual(["b"]);
    expect(filterNotes(notes, { ...base, query: "nade" }).map((n) => n.id)).toEqual(["a"]);
  });
  it("finds a note by its reference, in the reader's language", () => {
    expect(filterNotes(notes, { ...base, query: "romerbrevet 5" }).map((n) => n.id)).toEqual(["a"]);
    expect(filterNotes(notes, { ...base, query: "1 mosebog" }).map((n) => n.id)).toEqual(["b"]);
  });
  it("filters by topic", () => {
    expect(filterNotes(notes, { ...base, topic: "nåde" }).map((n) => n.id)).toEqual(["a"]);
  });
  it("Bible order: by first reference, notes without passages last", () => {
    expect(filterNotes(notes, { ...base, sort: "bible" }).map((n) => n.id)).toEqual(["b", "a", "c"]);
  });
});

describe("anchorForReference", () => {
  const chapter: Chapter = {
    translationId: "WEB",
    book: "JHN",
    chapter: 3,
    verses: [
      { verse: 1, text: "Now there was a man" },
      { verse: 2, text: "He came to Jesus" },
      { verse: 3, text: "Jesus answered him" },
    ],
  };
  it("a verse covers all its words", () => {
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 2 }, chapter)).toMatchObject({
      startVerse: 2,
      startWord: 0,
      endVerse: 2,
      endWord: 3,
    });
  });
  it("a chapter alone covers the whole chapter", () => {
    expect(anchorForReference({ book: "JHN", chapter: 3 }, chapter)).toMatchObject({ startVerse: 1, endVerse: 3, endWord: 2 });
  });
  it("a range past the chapter's end stops at its last verse", () => {
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 2, endVerse: 40 }, chapter)).toMatchObject({ startVerse: 2, endVerse: 3 });
  });
  it("refuses what an anchor can't hold", () => {
    expect(anchorForReference({ book: "JHN" }, chapter)).toBe("noChapter");
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 2, endChapter: 4, endVerse: 1 }, chapter)).toBe("crossChapter");
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 9 }, chapter)).toBe("noVerse");
  });
  it("a verse inside a bridge takes the whole bridge (BPH John 3:15 under 14)", () => {
    const bph: Chapter = {
      translationId: "BPH",
      book: "JHN",
      chapter: 3,
      verses: [
        { verse: 13, text: "Ingen er steget op" },
        { verse: 14, label: "14–15", text: "Ligesom Moses løftede slangen op" },
        { verse: 16, text: "For så højt har Gud elsket verden" },
      ],
    };
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 15 }, bph)).toMatchObject({ startVerse: 14, endVerse: 14, endWord: 4 });
    expect(anchorForReference({ book: "JHN", chapter: 3, verse: 15, endVerse: 16 }, bph)).toMatchObject({ startVerse: 14, endVerse: 16 });
  });
});

describe("keepOrder", () => {
  const n = (id: string) => ({ id });
  it("an edited note (now first by last edit) stays where it was", () => {
    expect(keepOrder([n("b"), n("a"), n("c")], ["a", "b", "c"]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("a note new since the view was entered comes first; deleted ones drop out", () => {
    expect(keepOrder([n("new"), n("a"), n("c")], ["a", "b", "c"]).map((x) => x.id)).toEqual(["new", "a", "c"]);
  });
});

describe("overviewRows", () => {
  const body = "See [Rom 8,28](bible:ROM.8.28) and [Joh 3,16](bible:JHN.3.16), again [x](bible:ROM.8.28).";
  it("lists text refs in text order, once each, then marked passages in Bible order", () => {
    const rows = overviewRows(body, [anchor("JHN", 3, 14), anchor("GEN", 1, 1)]);
    expect(rows.map((r) => (r.kind === "text" ? `t ${r.ref.book}${r.ref.chapter}:${r.ref.verse}` : `m ${r.anchor.book}`))).toEqual([
      "t ROM8:28",
      "t JHN3:16",
      "m GEN",
      "m JHN",
    ]);
  });
  it("keeps a marked passage that a text ref also cites (they are different things)", () => {
    expect(overviewRows("[Joh 3,16](bible:JHN.3.16)", [anchor("JHN", 3, 16)])).toHaveLength(2);
  });
  it("has unique keys", () => {
    const rows = overviewRows(body, [anchor("JHN", 3, 16)]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
  it("ignores refs inside code", () => {
    expect(overviewRows("`[a](bible:JHN.3.16)`", [])).toEqual([]);
  });
});

describe("snippetChapters", () => {
  it("text refs quote the reading translation, anchors their own; each chapter once", () => {
    const rows = overviewRows("[a](bible:JHN.3.16) [b](bible:JHN.3.18)", [{ ...anchor("JHN", 3, 14), translationId: "BPH" }]);
    expect(snippetChapters(rows, "WEB")).toEqual([
      { translationId: "WEB", book: "JHN", chapter: 3 },
      { translationId: "BPH", book: "JHN", chapter: 3 },
    ]);
  });
  it("fetches the first 10 distinct chapters only, plus the ones asked for", () => {
    const body = Array.from({ length: 12 }, (_, i) => `[x](bible:PSA.${i + 1})`).join(" ");
    const rows = overviewRows(body, []);
    expect(snippetChapters(rows, "WEB")).toHaveLength(10);
    const asked = new Set(["WEB/PSA/12"]);
    expect(snippetChapters(rows, "WEB", { asked }).map((c) => c.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  });
  it("waits for the reading translation for text refs", () => {
    expect(snippetChapters(overviewRows("[a](bible:JHN.3.16)", []), undefined)).toEqual([]);
  });
});

describe("cutSnippet", () => {
  it("leaves short text alone", () => {
    expect(cutSnippet("For God so loved", 40)).toBe("For God so loved");
  });
  it("cuts on a word boundary with an ellipsis, dropping trailing punctuation", () => {
    expect(cutSnippet("For God so loved the world, that he gave", 28)).toBe("For God so loved the world…");
    expect(cutSnippet("For God so loved the world", 20)).toBe("For God so loved the…");
  });
  it("cuts a single overlong word rather than showing nothing", () => {
    expect(cutSnippet("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghij…");
  });
});

describe("refSnippet", () => {
  const ch = (verses: { verse: number; label?: string; text: string }[]): Chapter => ({
    translationId: "BPH",
    book: "JHN",
    chapter: 3,
    verses,
    fumsToken: "",
  }) as unknown as Chapter;
  it("quotes the whole bridge a verse sits in", () => {
    const r = refSnippet({ book: "JHN", chapter: 3, verse: 15 }, ch([{ verse: 14, label: "14–15", text: "Som Moses" }, { verse: 16, text: "For så" }]));
    expect(r).not.toBe("notInTranslation");
    if (r !== "notInTranslation") {
      expect(r.text).toBe("Som Moses");
      expect(r.at.bridged).toBe(true);
    }
  });
  it("says when the translation lacks it", () => {
    expect(refSnippet({ book: "MAL", chapter: 4, verse: 1 }, null)).toBe("notInTranslation");
  });
});

describe("noteRefLabels", () => {
  it("counts inline refs too (a note cited only in its text has passages)", () => {
    expect(noteRefLabels(note("a", { body: "[Joh 3,16](bible:JHN.3.16)" }), da, "da")).toEqual(["Johannes 3,16"]);
  });
});
