import { describe, expect, it } from "vitest";
import { shownVerseCount } from "./print-limit";

/** A Scripture block whose word spans carry these verse numbers. */
const block = (...verses: number[]) => ({
  querySelectorAll: () => verses.map((v) => ({ dataset: { verse: String(v) } })),
});
const doc = (...blocks: ReturnType<typeof block>[]) =>
  ({ querySelectorAll: () => blocks }) as unknown as Pick<ParentNode, "querySelectorAll">;

describe("shownVerseCount", () => {
  it("counts distinct verses per Scripture block (a chapter + its run-on)", () => {
    expect(shownVerseCount(doc(block(1, 1, 2), block(1)))).toBe(3);
    expect(shownVerseCount(doc())).toBe(0);
  });
});
