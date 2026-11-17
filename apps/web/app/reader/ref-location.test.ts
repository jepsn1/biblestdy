import { describe, expect, it } from "vitest";
import { moreRefs, refTag, stepIndex, type RefLocator } from "./ref-location";

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

describe("moreRefs (#226)", () => {
  it("names the next page ahead with references, and how many land there", () => {
    expect(moreRefs([0, 1, 1, 3], 0)).toEqual({ page: 1, count: 2, back: false });
    expect(moreRefs([0, 1, 3], 1)).toEqual({ page: 3, count: 1, back: false });
  });
  it("past the last, points back to the first", () => {
    expect(moreRefs([0, 0, 2, 3], 3)).toEqual({ page: 0, count: 2, back: true });
  });
  it("says nothing when every reference is on this page or unplaced", () => {
    expect(moreRefs([], 0)).toBeNull();
    expect(moreRefs([2, 2, null], 2)).toBeNull();
  });
});

describe("] / [ (#213)", () => {
  it("steps from the spotlit reference, round the ends; none lit: ] the first, [ the last", () => {
    expect(stepIndex(3, -1, 1)).toBe(0);
    expect(stepIndex(3, -1, -1)).toBe(2);
    expect(stepIndex(3, 0, 1)).toBe(1);
    expect(stepIndex(3, 2, 1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBe(2);
    expect(stepIndex(0, -1, 1)).toBe(-1);
  });
});
