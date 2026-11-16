import type { Chapter } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { chipLabel, shortBookName } from "~/lib/reference-label";
import { atQuery, firstWords, readHref, verseOptions } from "./verse-resolver";

describe("verseOptions (typeahead query → results)", () => {
  it("the parsed match comes first, as an insertable reference", () => {
    const [first] = verseOptions("joh 3,16", "da");
    expect(first).toMatchObject({ kind: "ref", href: "bible:JHN.3.16", fuzzy: false });
  });
  it("takes `:` or `,`, Danish or English names", () => {
    expect(verseOptions("rom 8:28-30", "da")[0]).toMatchObject({ href: "bible:ROM.8.28-30" });
    expect(verseOptions("1 mos 1,1", "da")[0]).toMatchObject({ href: "bible:GEN.1.1" });
    expect(verseOptions("john 3:16", "en")[0]).toMatchObject({ href: "bible:JHN.3.16" });
  });
  it("accepts cross-chapter ranges", () => {
    expect(verseOptions("isa 52:13-53:12", "en")[0]).toMatchObject({ href: "bible:ISA.52.13-53.12" });
  });
  it("a bare book name suggests books to complete", () => {
    const opts = verseOptions("joh", "da");
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.kind === "book")).toBe(true);
    expect(opts[0]).toMatchObject({ kind: "book", book: "JHN", name: "Johannes" });
  });
  it("ambiguous short forms list several passages, at most the limit", () => {
    const opts = verseOptions("j3", "en", 6);
    expect(opts.length).toBe(6);
    expect(opts[0]).toMatchObject({ href: "bible:JHN.3" });
  });
  it("nothing for nonsense or nothing typed", () => {
    expect(verseOptions("", "da")).toEqual([]);
    expect(verseOptions("xyzzy 4", "da")).toEqual([]);
  });
});

describe("atQuery (when @ opens the typeahead)", () => {
  it("opens at the start of a word", () => {
    expect(atQuery("Se @joh 3,16", "da")).toEqual({ query: "joh 3,16", start: 3 });
    expect(atQuery("@", "da")).toEqual({ query: "", start: 0 });
    expect(atQuery("(@rom", "da")).toEqual({ query: "rom", start: 1 });
  });
  it("never inside a word (emails)", () => {
    expect(atQuery("mail a@b.dk", "da")).toBeNull();
  });
  it("a space with no hit leaves the literal text", () => {
    expect(atQuery("@hello world", "en")).toBeNull();
    expect(atQuery("@ ", "en")).toBeNull();
    expect(atQuery("@joh 3,16 og", "da")).toBeNull();
    expect(atQuery("@joh ", "da")).not.toBeNull();
  });
  it("other hits keep a spaced query open (page marks' words, #191)", () => {
    expect(atQuery("@gud elsk", "da", (q) => q === "gud elsk")).toEqual({ query: "gud elsk", start: 0 });
    expect(atQuery("@gud elsk", "da", () => false)).toBeNull();
  });
});

describe("chip labels", () => {
  it("are short, in the UI language, with no-break spaces", () => {
    expect(chipLabel({ book: "JHN", chapter: 3, verse: 16 }, "da")).toBe("Joh 3,16");
    expect(chipLabel({ book: "JHN", chapter: 3, verse: 16 }, "en")).toBe("John 3:16");
    expect(chipLabel({ book: "ISA", chapter: 52, verse: 13, endChapter: 53, endVerse: 12 }, "da")).toBe("Es 52,13–53,12");
    expect(chipLabel({ book: "PSA", chapter: 23 }, "da")).toBe("Sl 23");
    expect(chipLabel({ book: "GEN", chapter: 1, verse: 1 }, "da")).toBe("1 Mos 1,1");
  });
  it("keep the name where Danish has no one-word abbreviation", () => {
    expect(shortBookName("JOB", "da")).toBe("Job");
    expect(shortBookName("REV", "da")).toBe("Åb");
    expect(shortBookName("ACT", "da")).toBe("Apg");
  });
});

describe("firstWords", () => {
  const chapter: Chapter = {
    translationId: "BPH",
    book: "JHN",
    chapter: 3,
    verses: [
      { verse: 14, label: "14–15", text: "Ligesom Moses løftede slangen op i ørkenen sådan skal" },
      { verse: 16, text: "For så højt har Gud elsket verden" },
    ],
  };
  it("quotes the start of the verses, bridges whole", () => {
    expect(firstWords(chapter, { book: "JHN", chapter: 3, verse: 15 }, 4)).toBe("Ligesom Moses løftede slangen…");
    expect(firstWords(chapter, { book: "JHN", chapter: 3, verse: 16 }, 8)).toBe("For så højt har Gud elsket verden");
  });
  it("is empty when the chapter isn't loaded or lacks the verse", () => {
    expect(firstWords(undefined, { book: "JHN", chapter: 3, verse: 16 })).toBe("");
    expect(firstWords(chapter, { book: "JHN", chapter: 3, verse: 40 })).toBe("");
  });
});

describe("readHref", () => {
  it("reads the verses, keeping the note open", () => {
    expect(readHref({ book: "JHN", chapter: 3, verse: 16 }, "n1")).toBe("/read/JHN/3?v=16&note=n1");
    expect(readHref({ book: "JHN", chapter: 3, verse: 14, endVerse: 15 })).toBe("/read/JHN/3?v=14-15");
    expect(readHref({ book: "ISA", chapter: 52, verse: 13, endChapter: 53, endVerse: 12 })).toBe("/read/ISA/52?v=13-");
    expect(readHref({ book: "PSA", chapter: 23 })).toBe("/read/PSA/23");
  });
});
