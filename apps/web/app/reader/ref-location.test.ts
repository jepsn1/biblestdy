import { describe, expect, it } from "vitest";
import { refTag, type RefLocator } from "./ref-location";

const locator = (page: number | null, pages: Record<string, number | null>): RefLocator => ({
  book: "JHN",
  chapter: 3,
  page,
  pageOf: (spot) => pages[spot],
});

describe("refTag (#214)", () => {
  const john3 = { book: "JHN", chapter: 3 };
  it("names this page, another page (1-based), another chapter", () => {
    const l = locator(1, { a: 1, b: 2 });
    expect(refTag(l, "a", john3)).toEqual({ kind: "thisPage" });
    expect(refTag(l, "b", john3)).toEqual({ kind: "page", page: 3 });
    expect(refTag(l, "c", { book: "ROM", chapter: 8 })).toEqual({ kind: "chapter", book: "ROM", chapter: 8 });
    expect(refTag(l, "c", { book: "JHN", chapter: 4 })).toEqual({ kind: "chapter", book: "JHN", chapter: 4 });
  });
  it("says nothing it can't know: off the reader, unplaced, a phone's one column, chapter unknown", () => {
    expect(refTag(undefined, "a", john3)).toBeNull();
    expect(refTag(locator(0, {}), "a", john3)).toBeNull();
    expect(refTag(locator(0, {}), null, john3)).toBeNull();
    expect(refTag(locator(null, { a: null }), "a", john3)).toBeNull();
    expect(refTag(locator(0, { a: 0 }), "a", null)).toBeNull();
  });
  it("still names another chapter on a phone", () => {
    expect(refTag(locator(null, {}), "x", { book: "ROM", chapter: 8 })).toEqual({ kind: "chapter", book: "ROM", chapter: 8 });
  });
});
