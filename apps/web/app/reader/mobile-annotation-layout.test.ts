import { describe, expect, it } from "vitest";
import {
  BOX_INSET,
  DEFAULT_BOX_HEIGHT,
  LINE_GAP,
  STACK_GAP,
  layoutMobileAnnotations,
  type ColumnGeometry,
  type LineRect,
} from "./mobile-annotation-layout";

/** One column of the print-fixed sheet: 320px wide, 36px leading. */
const column: ColumnGeometry = { x: 100, width: 320, top: 40, height: 600, lineHeight: 36 };

/** A glyph rect on line n (line slots start at column.top, one per leading). */
const line = (n: number, over: Partial<LineRect> = {}): LineRect => ({
  x: 120,
  y: column.top + n * column.lineHeight,
  w: 180,
  h: 20,
  ...over,
});

describe("layoutMobileAnnotations", () => {
  it("places the box directly below the anchor's line, near-column width", () => {
    const [p] = layoutMobileAnnotations([{ id: "a", lineRects: [line(2)] }], column);
    expect(p).toEqual({
      id: "a",
      x: column.x + BOX_INSET,
      y: line(2).y + column.lineHeight + LINE_GAP,
      width: column.width - BOX_INSET * 2,
    });
  });

  it("hangs the box off the anchor's LAST line for a multi-line anchor", () => {
    const [p] = layoutMobileAnnotations(
      [{ id: "a", lineRects: [line(1), line(2), line(3)] }],
      column,
    );
    expect(p.y).toBe(line(3).y + column.lineHeight + LINE_GAP);
  });

  it("clears descenders: a glyph rect taller than the leading still wins", () => {
    const tall = line(0, { h: 44 });
    const [p] = layoutMobileAnnotations([{ id: "a", lineRects: [tall] }], column);
    expect(p.y).toBe(tall.y + 44 + LINE_GAP);
  });

  it("ignores the anchor's horizontal position — width never depends on the span", () => {
    const [wide, narrow] = layoutMobileAnnotations(
      [
        { id: "wide", lineRects: [line(0, { x: 105, w: 300 })] },
        { id: "narrow", lineRects: [line(5, { x: 390, w: 12 })] },
      ],
      column,
    );
    expect(wide.x).toBe(narrow.x);
    expect(wide.width).toBe(narrow.width);
  });

  it("stacks same-line anchors downward in text order", () => {
    const [a, b] = layoutMobileAnnotations(
      [
        { id: "a", lineRects: [line(1)] },
        { id: "b", lineRects: [line(1)] },
      ],
      column,
    );
    expect(a.y).toBe(line(1).y + column.lineHeight + LINE_GAP);
    expect(b.y).toBe(a.y + DEFAULT_BOX_HEIGHT + STACK_GAP);
  });

  it("keeps output in input (text) order even while stacking", () => {
    const ids = layoutMobileAnnotations(
      [
        { id: "first", lineRects: [line(1)] },
        { id: "second", lineRects: [line(1)] },
        { id: "third", lineRects: [line(2)] },
      ],
      column,
    ).map((p) => p.id);
    expect(ids).toEqual(["first", "second", "third"]);
  });

  it("offsets a next-line box that would collide with a tall earlier box", () => {
    const tallBox = 90; // deeper than one leading — spills past line 2's slot
    const [a, b] = layoutMobileAnnotations(
      [
        { id: "a", lineRects: [line(1)], height: tallBox },
        { id: "b", lineRects: [line(2)] },
      ],
      column,
    );
    expect(b.y).toBe(a.y + tallBox + STACK_GAP);
  });

  it("leaves far-apart anchors at their natural below-line slots", () => {
    const [a, b] = layoutMobileAnnotations(
      [
        { id: "a", lineRects: [line(0)] },
        { id: "b", lineRects: [line(8)] },
      ],
      column,
    );
    expect(a.y).toBe(line(0).y + column.lineHeight + LINE_GAP);
    expect(b.y).toBe(line(8).y + column.lineHeight + LINE_GAP); // no offset
  });

  it("clamps a last-line anchor's box inside the column", () => {
    const lastLine = line(0, { y: column.top + column.height - 30, h: 20 });
    const [p] = layoutMobileAnnotations(
      [{ id: "a", lineRects: [lastLine], height: 40 }],
      column,
    );
    expect(p.y + 40).toBeLessThanOrEqual(column.top + column.height);
    expect(p.y).toBeGreaterThanOrEqual(column.top);
  });

  it("stacks many marks on one line without overlap, all in text order", () => {
    const heights = [22, 40, 22, 31];
    const placements = layoutMobileAnnotations(
      heights.map((height, i) => ({ id: `m${i}`, lineRects: [line(3)], height })),
      column,
    );
    expect(placements.map((p) => p.id)).toEqual(["m0", "m1", "m2", "m3"]);
    for (let i = 1; i < placements.length; i++) {
      // each box starts below the previous box's bottom edge
      expect(placements[i].y).toBe(placements[i - 1].y + heights[i - 1] + STACK_GAP);
    }
  });

  it("skips an annotation whose anchor is off-page (no line rects)", () => {
    const placements = layoutMobileAnnotations(
      [
        { id: "gone", lineRects: [] },
        { id: "here", lineRects: [line(1)] },
      ],
      column,
    );
    expect(placements.map((p) => p.id)).toEqual(["here"]);
  });
});
