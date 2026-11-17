import { describe, expect, it } from "vitest";
import { wordEnds, wordRects } from "./word-rects";

const box = (left: number, top: number, width: number, height = 20) => ({ left, top, width, height, right: left + width, bottom: top + height });
const el = (...rects: ReturnType<typeof box>[]) => ({ getClientRects: () => rects as unknown as DOMRectList });

describe("wordRects (#240)", () => {
  it("one line: the word and its space are one box", () => {
    expect(wordRects(el(box(10, 0, 30), box(40, 0, 4)))).toEqual([{ left: 10, top: 0, right: 44, bottom: 20 }]);
  });
  it("a word hyphenated over two lines: a box per line, never one spanning both", () => {
    const rects = wordRects(el(box(200, 0, 80), box(0, 30, 60), box(60, 30, 4)));
    expect(rects).toEqual([
      { left: 200, top: 0, right: 280, bottom: 20 },
      { left: 0, top: 30, right: 64, bottom: 50 },
    ]);
  });
  it("skips empty pieces; the ends are the first and last line's", () => {
    const e = el(box(5, 0, 0), box(200, 0, 80), box(0, 30, 60));
    expect(wordEnds(e)).toEqual({ first: { left: 200, top: 0, right: 280, bottom: 20 }, last: { left: 0, top: 30, right: 60, bottom: 50 } });
    expect(wordEnds(el())).toBeNull();
  });
});
