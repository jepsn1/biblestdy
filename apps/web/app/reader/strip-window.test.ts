import { describe, expect, it } from "vitest";
import { stripWindow, type StripItem } from "./strip-window";

/** "1 … 21 22 23 … 150" */
const show = (items: StripItem[]) =>
  items.map((i) => (i.kind === "chapter" ? String(i.n) : "…")).join(" ");

describe("stripWindow", () => {
  it("shows every chapter when they fit, ", () => {
    expect(show(stripWindow({ count: 5, current: 3, slots: 20 }).items)).toBe("1 2 3 4 5");
    expect(show(stripWindow({ count: 20, current: 3, slots: 20 }).items)).toBe(
      Array.from({ length: 20 }, (_, i) => i + 1).join(" "),
    );
  });

  it("a one-chapter book is its one number", () => {
    expect(show(stripWindow({ count: 1, current: 1, slots: 8 }).items)).toBe("1");
  });

  it("always fills exactly the slots it has when windowed", () => {
    for (const slots of [6, 7, 9, 12, 25, 40]) {
      for (const current of [1, 2, 3, 4, 50, 75, 147, 148, 149, 150]) {
        expect(stripWindow({ count: 150, current, slots }).items).toHaveLength(slots);
      }
    }
  });

  it("centres a run on the current chapter, first and last always shown", () => {
    expect(show(stripWindow({ count: 150, current: 75, slots: 11 }).items)).toBe("1 … 72 73 74 75 76 77 78 … 150");
  });

  it("joins the run to an end rather than leave a gap for one chapter", () => {
    expect(show(stripWindow({ count: 150, current: 1, slots: 11 }).items)).toBe("1 2 3 4 5 6 7 8 9 … 150");
    expect(show(stripWindow({ count: 150, current: 6, slots: 11 }).items)).toBe("1 2 3 4 5 6 7 8 9 … 150");
    expect(show(stripWindow({ count: 150, current: 150, slots: 11 }).items)).toBe(
      "1 … 142 143 144 145 146 147 148 149 150",
    );
  });

  it("never drops below 1 … n … last, even in a tiny row", () => {
    expect(show(stripWindow({ count: 150, current: 75, slots: 2 }).items)).toBe("1 … 75 … 150");
  });

  it("keeps the run put while the reader clicks inside it", () => {
    const first = stripWindow({ count: 150, current: 75, slots: 11 });
    const next = stripWindow({ count: 150, current: 77, slots: 11, keep: first.start });
    expect(show(next.items)).toBe(show(first.items));
    expect(next.start).toBe(first.start);
  });

  it("recentres when the reader picks a number on the run's edge", () => {
    const first = stripWindow({ count: 150, current: 75, slots: 11 });
    expect(show(stripWindow({ count: 150, current: 78, slots: 11, keep: first.start }).items)).toBe(
      "1 … 75 76 77 78 79 80 81 … 150",
    );
  });

  it("a run joined to the book's start stays put up to its last number", () => {
    const first = stripWindow({ count: 150, current: 1, slots: 11 });
    expect(show(stripWindow({ count: 150, current: 8, slots: 11, keep: first.start }).items)).toBe(
      show(first.items),
    );
  });

  it("recentres from a stale run that no longer holds the chapter", () => {
    expect(show(stripWindow({ count: 150, current: 120, slots: 11, keep: 72 }).items)).toBe(
      "1 … 117 118 119 120 121 122 123 … 150",
    );
  });
});
