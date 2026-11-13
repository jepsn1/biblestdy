import { describe, expect, it } from "vitest";
import {
  clampToColumn,
  collisions,
  intersects,
  lineOf,
  lineRuns,
  placeRailChips,
  type RailGeometry,
  type Rect,
} from "./ink-geometry";

const r = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe("lineRuns", () => {
  it("merges words on one line, splits lines and spread columns", () => {
    const runs = lineRuns([
      r(100, 10, 140, 30),
      r(140, 10, 190, 30),
      r(100, 40, 160, 60), // next line
      r(600, 10, 650, 30), // same top, other column
    ]);
    expect(runs).toEqual([r(100, 10, 190, 30), r(100, 40, 160, 60), r(600, 10, 650, 30)]);
  });
});

describe("clampToColumn", () => {
  const flow = { x: 100, colWidth: 400, gap: 56 };

  it("cuts a wash's trailing-space overhang at the column edge", () => {
    expect(clampToColumn(r(300, 10, 512, 30), flow)).toEqual(r(300, 10, 500, 30));
  });

  it("clamps to the right column of a spread (and later pages)", () => {
    expect(clampToColumn(r(560, 10, 970, 30), flow)).toEqual(r(560, 10, 956, 30));
    const page2 = 2 * (400 + 56);
    expect(clampToColumn(r(100 + page2 - 2, 10, 200 + page2, 30), flow).left).toBe(100 + page2);
  });

  it("leaves a run inside the column alone", () => {
    expect(clampToColumn(r(120, 10, 300, 30), flow)).toEqual(r(120, 10, 300, 30));
  });
});

describe("lineOf", () => {
  it("anchors to the whole selected line the reference word sits on", () => {
    const words = [r(100, 10, 150, 30), r(150, 10, 220, 30), r(100, 40, 180, 60)];
    expect(lineOf(words, words[1])).toEqual(r(100, 10, 220, 30));
    expect(lineOf(words, words[2])).toEqual(r(100, 40, 180, 60));
  });

  it("never spans into the other column of a spread", () => {
    const words = [r(100, 10, 150, 30), r(600, 10, 650, 30)];
    expect(lineOf(words, words[1])).toEqual(r(600, 10, 650, 30));
  });
});

describe("placeRailChips", () => {
  const rail: RailGeometry = {
    leftEnd: 200,
    rightStart: 900,
    regionWidth: 1200,
    edge: 8,
    chipH: 24,
    gap: 4,
    maxWidth: 160,
    obstacles: [],
  };

  it("parks chips in the rail beside their line, clear of the text column", () => {
    const [a, b] = placeRailChips(
      [
        { id: "a", side: "left", centerY: 100 },
        { id: "b", side: "right", centerY: 300 },
      ],
      rail,
    )!;
    expect(a).toEqual({ id: "a", side: "left", x: 40, y: 88, width: 160 });
    expect(a.x + a.width).toBeLessThanOrEqual(rail.leftEnd);
    expect(b).toEqual({ id: "b", side: "right", x: 900, y: 288, width: 160 });
  });

  it("stacks chips on nearby lines instead of overlapping", () => {
    const chips = placeRailChips(
      [
        { id: "a", side: "left", centerY: 100 },
        { id: "b", side: "left", centerY: 110 },
        { id: "c", side: "left", centerY: 112 },
      ],
      rail,
    )!;
    const ys = chips.map((c) => c.y);
    expect(ys).toEqual([88, 116, 144]);
  });

  it("steps around default-placed annotation boxes in the same rail", () => {
    const [a] = placeRailChips([{ id: "a", side: "left", centerY: 100 }], {
      ...rail,
      obstacles: [{ side: "left", top: 80, bottom: 120 }],
    })!;
    expect(a.y).toBe(124);
  });

  it("narrows to the room left; gives up (inline markers) below one target", () => {
    const [a] = placeRailChips([{ id: "a", side: "left", centerY: 50 }], {
      ...rail,
      leftEnd: 60,
    })!;
    expect(a.width).toBe(52);
    expect(placeRailChips([{ id: "a", side: "left", centerY: 50 }], { ...rail, leftEnd: 20 })).toBe(
      null,
    );
  });
});

describe("collisions", () => {
  it("finds a box covering a word, ignores touching edges", () => {
    const words = [r(100, 10, 150, 30), r(150, 10, 200, 30)];
    expect(intersects(r(150, 30, 170, 50), words[1])).toBe(false); // touches corner
    expect(collisions([r(140, 20, 160, 40)], words)).toHaveLength(2);
    expect(collisions([r(10, 10, 90, 30)], words)).toEqual([]);
  });
});
