import { describe, expect, it } from "vitest";
import { showVerses, shownVerseCount } from "./print-limit";

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

describe("showVerses (print limit kept current)", () => {
  it("marks the page once the shown blocks pass 100 verses, unmarks on unmount", () => {
    const attrs = new Set<string>();
    const html = { toggleAttribute: (n: string, on: boolean) => (on ? attrs.add(n) : attrs.delete(n)) };
    const g = globalThis as { document?: unknown };
    const saved = g.document;
    g.document = { documentElement: html };
    try {
      const a = showVerses(90);
      expect(attrs.has("data-print-limited")).toBe(false);
      const b = showVerses(15);
      expect(attrs.has("data-print-limited")).toBe(true);
      b();
      expect(attrs.has("data-print-limited")).toBe(false);
      a();
    } finally {
      g.document = saved;
    }
  });
});
