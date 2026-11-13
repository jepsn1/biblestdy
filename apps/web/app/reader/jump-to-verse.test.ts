import { parseReference } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { parseVerseParam, referenceHref, targetVerses } from "./chapter-nav";

/** Jump box (#53): typed reference → URL → verse the reader lands on. */
describe("referenceHref", () => {
  const href = (input: string) => {
    const ref = parseReference(input, "da");
    return ref && referenceHref(ref);
  };

  it("opens the verse, a range, or the chapter", () => {
    expect(href("rom 8:28")).toBe("/read/ROM/8?v=28");
    expect(href("joh 3:16-18")).toBe("/read/JHN/3?v=16-18");
    expect(href("1 kor 13")).toBe("/read/1CO/13");
    expect(href("Johannes 3,16")).toBe("/read/JHN/3?v=16");
  });

  it("a bare book opens chapter 1; a cross-chapter range runs to the chapter end", () => {
    expect(href("rom")).toBe("/read/ROM/1");
    expect(href("joh 3:16-4:2")).toBe("/read/JHN/3?v=16-");
  });
});

describe("parseVerseParam", () => {
  it("reads a verse, a range, and an open range", () => {
    expect(parseVerseParam("28")).toEqual({ start: 28, end: 28 });
    expect(parseVerseParam("16-18")).toEqual({ start: 16, end: 18 });
    expect(parseVerseParam("16-")).toEqual({ start: 16, end: Infinity });
  });

  it("rejects junk", () => {
    for (const bad of [null, "", "0", "x", "18-16", "-3", "3-4-5"]) {
      expect(parseVerseParam(bad)).toBeNull();
    }
  });
});

describe("targetVerses", () => {
  const plain = [1, 2, 3, 4, 5];
  it("lands on the stored verses", () => {
    expect(targetVerses(plain, { start: 2, end: 4 })).toEqual({ start: 2, end: 4 });
  });

  it("a verse inside a bridge lands on the bridge (BPH 3:15 under 14)", () => {
    const bridged = [12, 13, 14, 16, 17];
    expect(targetVerses(bridged, { start: 15, end: 15 })).toEqual({ start: 14, end: 14 });
    expect(targetVerses(bridged, { start: 15, end: 16 })).toEqual({ start: 14, end: 16 });
  });

  it("clamps past the end; open ranges run to the last verse", () => {
    expect(targetVerses(plain, { start: 99, end: 99 })).toEqual({ start: 5, end: 5 });
    expect(targetVerses(plain, { start: 3, end: Infinity })).toEqual({ start: 3, end: 5 });
    expect(targetVerses([], { start: 1, end: 1 })).toBeNull();
  });
});
