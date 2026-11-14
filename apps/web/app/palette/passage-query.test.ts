import { formatReference, type BookLocale } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { bookQuery, findPassages, reversedBook, typoBooks } from "./passage-query";

/** Hits as "John 3:16" strings (English names, `:`), best first. */
const refs = (input: string, locale: BookLocale = "en") => findPassages(input, locale).map((h) => formatReference(h.ref));
const top = (input: string, locale: BookLocale = "en") => refs(input, locale)[0];

describe("findPassages: the top reading", () => {
  it.each([
    // Plain, glued, abbreviated (en)
    ["john 3", "John 3"],
    ["John 3", "John 3"],
    ["joh 3", "John 3"],
    ["joh3", "John 3"],
    ["jn 3", "John 3"],
    ["jhn 3", "John 3"],
    ["JHN 3", "John 3"],
    ["john3", "John 3"],
    ["j3", "John 3"],
    ["j 3", "John 3"],
    ["rom 8", "Romans 8"],
    ["rom8:28", "Romans 8:28"],
    ["ps 23", "Psalms 23"],
    ["psalm 119:105", "Psalms 119:105"],
    ["gen1", "Genesis 1"],
    ["song of sol 2", "Song of Solomon 2"],
    ["phil 4:13", "Philippians 4:13"],
    // Verse separators
    ["john 3:16", "John 3:16"],
    ["john 3,16", "John 3:16"],
    ["john 3.16", "John 3:16"],
    ["john 3 16", "John 3:16"],
    ["john 3v16", "John 3:16"],
    ["john 3 v 16", "John 3:16"],
    ["jn3:16", "John 3:16"],
    ["joh. 3,16", "John 3:16"],
    // Ranges
    ["john 3:16-18", "John 3:16-18"],
    ["john 3:16–18", "John 3:16-18"],
    ["john 3:16–4:2", "John 3:16-4:2"],
    ["john 3:16 - 4:2", "John 3:16-4:2"],
    ["1 joh 4,7-8", "1 John 4:7-8"],
    // Still typing: trailing separators, a range end not there yet
    ["john 3:", "John 3"],
    ["john 3,", "John 3"],
    ["john 3:16-", "John 3:16"],
    ["john 3:16-1", "John 3:16"],
    // Numbered books
    ["1 john 4", "1 John 4"],
    ["1john 4", "1 John 4"],
    ["1jn 4", "1 John 4"],
    ["1 jn 4", "1 John 4"],
    ["1 joh 4", "1 John 4"],
    ["1. joh 4", "1 John 4"],
    ["i john 4", "1 John 4"],
    ["ii cor 5", "2 Corinthians 5"],
    ["first john 4", "1 John 4"],
    ["second tim 3:16", "2 Timothy 3:16"],
    ["1st cor 13", "1 Corinthians 13"],
    ["1 cor 13:4", "1 Corinthians 13:4"],
    ["2 kings 5", "2 Kings 5"],
    ["3 john 1", "3 John 1"],
    // One-chapter books: a single number is a verse
    ["jude 5", "Jude 1:5"],
    ["3 john 4", "3 John 1:4"],
    ["phm 10", "Philemon 1:10"],
    ["jude 3-5", "Jude 1:3-5"],
    ["jude 1", "Jude 1"],
    // Numbers first
    ["3:16 john", "John 3:16"],
    ["3,16 joh", "John 3:16"],
    ["16 john", "John 16"],
    ["8:28 rom", "Romans 8:28"],
    ["2 rom", "Romans 2"],
    ["3 john 16", "John 3:16"],
    ["3:16-18 john", "John 3:16-18"],
    // Typos
    ["jonh 3", "John 3"],
    ["jonh 3:16", "John 3:16"],
    ["phillipians 4", "Philippians 4"],
    ["pslam 23", "Psalms 23"],
    ["revelations 21", "Revelation 21"],
    ["mathew 5", "Matthew 5"],
  ])("%s → %s", (input, expected) => {
    expect(top(input)).toBe(expected);
  });
});

describe("findPassages: Danish", () => {
  it.each([
    ["Joh 3,16", "John 3:16"],
    ["joh 3", "John 3"],
    ["Johannes 3", "John 3"],
    ["sl 23", "Psalms 23"],
    ["Sl 23,1", "Psalms 23:1"],
    ["Åb 21", "Revelation 21"],
    ["åb 21", "Revelation 21"],
    ["ab 21", "Revelation 21"],
    ["aab 21", "Revelation 21"],
    ["1 mos 1", "Genesis 1"],
    ["1. mos 1,1", "Genesis 1:1"],
    ["1mos 1", "Genesis 1"],
    ["første mos 3", "Genesis 3"],
    ["anden mos 20", "Exodus 20"],
    ["1 kor 13", "1 Corinthians 13"],
    ["2 kor 5,17", "2 Corinthians 5:17"],
    ["Matt 5", "Matthew 5"],
    ["matthæus 5", "Matthew 5"],
    ["mattaeus 5", "Matthew 5"],
    ["præd 3", "Ecclesiastes 3"],
    ["praed 3", "Ecclesiastes 3"],
    ["højs 2", "Song of Solomon 2"],
    ["hoejs 2", "Song of Solomon 2"],
    ["apg 2", "Acts 2"],
    ["1 joh 4", "1 John 4"],
    ["jak 1", "James 1"],
    ["es 53", "Isaiah 53"],
    ["ez 37", "Ezekiel 37"],
    ["johanes 3", "John 3"],
  ])("%s → %s", (input, expected) => {
    expect(top(input, "da")).toBe(expected);
  });

  it("the UI language decides clashes, the other one still shows", () => {
    expect(refs("es 3", "en")).toEqual(["Esther 3", "Isaiah 3"]);
    expect(refs("es 3", "da")).toEqual(["Isaiah 3", "Esther 3"]);
    // Esther has 10 chapters: only Isaiah fits
    expect(refs("es 53", "en")).toEqual(["Isaiah 53"]);
    expect(refs("ez 3", "da")).toEqual(["Ezekiel 3", "Ezra 3"]);
  });
});

describe("findPassages: several readings", () => {
  it("one letter: the J books with a chapter 3, most read first", () => {
    const j3 = refs("j3");
    expect(j3[0]).toBe("John 3");
    expect(j3).toHaveLength(5);
    expect(j3).toEqual(expect.arrayContaining(["James 3", "Job 3"]));
    // No duplicates (John and Johannes are one book)
    expect(new Set(j3).size).toBe(j3.length);
  });

  it("a short prefix ranks by popularity", () => {
    expect(refs("ma 5")[0]).toBe("Matthew 5");
    expect(refs("ma 5")).toContain("Mark 5");
    // Mark has 16 chapters, Malachi 4
    expect(refs("ma 17")).toEqual(["Matthew 17"]);
  });

  it("an exact name or abbreviation shows only that book", () => {
    expect(refs("john 3")).toEqual(["John 3"]);
    expect(refs("joh 3")).toEqual(["John 3"]);
    expect(refs("job 3")).toEqual(["Job 3"]);
    expect(refs("jon 3")).toEqual(["Jonah 3"]);
  });

  it("a numbered book typed without its number: each that fits", () => {
    expect(refs("cor 13")).toEqual(["1 Corinthians 13", "2 Corinthians 13"]);
    expect(refs("peter 3")).toEqual(["1 Peter 3", "2 Peter 3"]);
    expect(refs("kor 16", "da")).toEqual(["1 Corinthians 16"]);
  });

  it("a typo is marked as a guess; an exact match is not", () => {
    expect(findPassages("jonh 3", "en")[0].kind).toBe("fuzzy");
    expect(findPassages("john 3", "en")[0].kind).toBe("exact");
    expect(findPassages("j3", "en")[0].kind).toBe("prefix");
  });
});

describe("findPassages: not a passage", () => {
  it.each([
    "",
    "john", // a book: the books group
    "3 john", // the book 3 John
    "1 sam",
    "rom 99", // Romans has 16 chapters
    "rom 0",
    "psalm 151",
    "jude 26", // 25 verses
    "3 john 1:16",
    "joy 3", // too short to be a typo of Job
    "love 3",
    "day 3",
    "god",
    "23",
    "16 3 john", // two bare numbers before a book: not a reading we know
    "is", // "i" + "s" isn't the ordinal i
  ])("%s → nothing", (input) => {
    expect(refs(input)).toEqual([]);
  });

  it("'is 53' is Isaiah, not an ordinal", () => {
    expect(top("is 53")).toBe("Isaiah 53");
  });

  it("verse 0 drops the verse", () => {
    expect(top("john 3:0")).toBe("John 3");
  });
});

describe("reversedBook: '3 john' could also be John 3", () => {
  it.each([
    ["3 john", "John 3"],
    ["1 john", "John 1"],
    ["2 rom", "Romans 2"],
    ["3joh", "John 3"],
  ])("%s → %s", (input, expected) => {
    const hit = reversedBook(input, "en");
    expect(hit && formatReference(hit.ref)).toBe(expected);
  });

  it.each(["1 sam", "2 kings", "john", "3 john 1", "1 mos"])("%s → none", (input) => {
    expect(reversedBook(input, "da")).toBeUndefined();
  });
});

describe("book helpers", () => {
  it("bookQuery turns a worded ordinal into a digit", () => {
    expect(bookQuery("first john")).toBe("1 john");
    expect(bookQuery("første kor")).toBe("1 kor");
    expect(bookQuery("john")).toBe("john");
    expect(bookQuery("1 john")).toBe("1 john");
  });

  it("typoBooks finds a misspelt book, never a short word (5+ letters)", () => {
    expect(typoBooks("phillipians", "en")).toEqual(["PHP"]);
    expect(typoBooks("mathew", "en")).toEqual(["MAT"]);
    expect(typoBooks("johanes", "da")[0]).toBe("JHN");
    expect(typoBooks("jonh", "en")).toEqual([]);
    expect(typoBooks("dark", "en")).toEqual([]);
    expect(typoBooks("revelations", "en")).toEqual(["REV"]);
    expect(typoBooks("joy", "en")).toEqual([]);
    expect(typoBooks("love", "en")).toEqual([]);
    expect(typoBooks("hope", "en")).toEqual([]);
  });

  it("is fast enough per keystroke", () => {
    const t = performance.now();
    for (let i = 0; i < 200; i++) findPassages("phillipians 4:13", "en");
    expect((performance.now() - t) / 200).toBeLessThan(5);
  });
});
