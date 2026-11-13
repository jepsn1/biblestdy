import { describe, expect, it } from "vitest";
import {
  adjacentChapter,
  chapterHref,
  lastReadHref,
  lastReadValue,
  parsePageParam,
  resolvePage,
} from "./chapter-nav";

describe("adjacentChapter", () => {
  it("steps within a book", () => {
    expect(adjacentChapter({ book: "JHN", chapter: 3 }, 1)).toEqual({ book: "JHN", chapter: 4 });
    expect(adjacentChapter({ book: "JHN", chapter: 3 }, -1)).toEqual({ book: "JHN", chapter: 2 });
  });

  it("crosses into the next book at its first chapter", () => {
    expect(adjacentChapter({ book: "JHN", chapter: 21 }, 1)).toEqual({ book: "ACT", chapter: 1 });
    expect(adjacentChapter({ book: "MAL", chapter: 4 }, 1)).toEqual({ book: "MAT", chapter: 1 });
  });

  it("crosses back into the previous book at its last chapter", () => {
    expect(adjacentChapter({ book: "ACT", chapter: 1 }, -1)).toEqual({ book: "JHN", chapter: 21 });
    expect(adjacentChapter({ book: "EXO", chapter: 1 }, -1)).toEqual({ book: "GEN", chapter: 50 });
  });

  it("stops at both ends of the Bible and on unknown books", () => {
    expect(adjacentChapter({ book: "GEN", chapter: 1 }, -1)).toBeNull();
    expect(adjacentChapter({ book: "REV", chapter: 22 }, 1)).toBeNull();
    expect(adjacentChapter({ book: "XXX", chapter: 1 }, 1)).toBeNull();
  });
});

describe("page param", () => {
  it("parses 1-based pages, 'last', and falls back to the first page", () => {
    expect(parsePageParam("2")).toBe(1);
    expect(parsePageParam("last")).toBe("last");
    expect(parsePageParam(null)).toBe(0);
    expect(parsePageParam("0")).toBe(0);
    expect(parsePageParam("abc")).toBe(0);
    expect(parsePageParam("1.5")).toBe(0);
  });

  it("'last' lands on the last measured page", () => {
    expect(resolvePage("last", 3)).toBe(2);
    expect(resolvePage("last", 1)).toBe(0);
  });

  it("clamps a stale page into the measured count", () => {
    expect(resolvePage(5, 3)).toBe(2);
    expect(resolvePage(1, 3)).toBe(1);
  });
});

describe("hrefs", () => {
  it("keeps page 1 clean and adds ?p for later pages", () => {
    expect(chapterHref({ book: "JHN", chapter: 3 })).toBe("/read/JHN/3");
    expect(chapterHref({ book: "JHN", chapter: 3 }, 1)).toBe("/read/JHN/3?p=2");
    expect(chapterHref({ book: "JHN", chapter: 2 }, "last")).toBe("/read/JHN/2?p=last");
  });

  it("lastRead round-trips the page and accepts the old page-less format", () => {
    const value = lastReadValue({ book: "JHN", chapter: 3 }, 1);
    expect(value).toBe("JHN/3?p=2");
    expect(lastReadHref(value)).toBe("/read/JHN/3?p=2");
    expect(lastReadHref("1JN/2")).toBe("/read/1JN/2");
    expect(lastReadHref("javascript:alert(1)")).toBeNull();
    expect(lastReadHref(null)).toBeNull();
  });
});
