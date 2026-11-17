import { describe, expect, it } from "vitest";
import {
  bracketLanes,
  connectorPath,
  needsConnector,
  clampToColumn,
  collisions,
  columnOf,
  intersects,
  lineOf,
  lineRuns,
  pageOfColumn,
  placeRailChips,
  sideOfSpan,
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

describe("paged flow: a mark's column, page and side (#164)", () => {
  // Single-column page (Notes panel open): 544px column, 56px gap
  const single = { x: 24, colStride: 600, pageStride: 600 };
  // Two-column spread: 392px columns, 56px gap, two per page
  const spread = { x: 24, colStride: 448, pageStride: 896 };

  it("puts a line starting a sub-pixel left of page 2 on page 2", () => {
    // WEB John 3:14-15 on page 2: the bracket's box starts at x 623.6
    const lineStart = r(623.6, 218, 700, 240);
    const col = columnOf(lineStart, single);
    expect(col).toBe(1);
    expect(pageOfColumn(col, single)).toBe(1);
  });

  it("pages every column of a single-column flow", () => {
    for (let n = 0; n < 5; n++) {
      const word = r(24 + n * 600 - 0.4, 0, 24 + n * 600 + 40, 20);
      expect(pageOfColumn(columnOf(word, single), single)).toBe(n);
    }
  });

  it("keeps both columns of a spread on one page", () => {
    expect(pageOfColumn(0, spread)).toBe(0);
    expect(pageOfColumn(1, spread)).toBe(0);
    expect(pageOfColumn(2, spread)).toBe(1);
    expect(pageOfColumn(3, spread)).toBe(1);
    // A word at the second spread's right column's start
    expect(pageOfColumn(columnOf(r(24 + 3 * 448 - 0.5, 0, 24 + 3 * 448 + 30, 20), spread), spread)).toBe(1);
  });

  it("is page 0 without paging (one scroll column)", () => {
    expect(pageOfColumn(3, { x: 0, colStride: 600, pageStride: 0 })).toBe(0);
    expect(columnOf(r(5000, 0, 5040, 20), { x: 0, colStride: 0, pageStride: 0 })).toBe(0);
  });

  it("gives a full-width span the same side on every page", () => {
    // Page n's middle: n * 600 + 296; the span's middle is a sub-pixel off it
    for (let n = 0; n < 4; n++) {
      expect(sideOfSpan(n * 600 + 23.6, n * 600 + 568, n * 600 + 296)).toBe("right");
      expect(sideOfSpan(n * 600 + 24.4, n * 600 + 568.3, n * 600 + 296)).toBe("right");
    }
  });

  it("puts a span clearly left of the middle on the left", () => {
    expect(sideOfSpan(24, 200, 296)).toBe("left");
    expect(sideOfSpan(400, 568, 296)).toBe("right");
    // Spread: left column left, right column right
    expect(sideOfSpan(24, 416, 472)).toBe("left");
    expect(sideOfSpan(472, 864, 472)).toBe("right");
  });
});

describe("bracketLanes (#211)", () => {
  const s = (id: string, top: number, bottom: number, pinned = false) => ({ id, top, bottom, pinned });
  it("gives lone brackets lane 0", () => {
    expect(bracketLanes([s("a", 0, 30), s("b", 60, 90)])).toEqual({ lanes: { a: 0, b: 0 }, groups: [] });
  });
  it("nests two overlapping brackets, the shortest nearest the text", () => {
    const { lanes, groups } = bracketLanes([s("long", 0, 120), s("short", 30, 60)]);
    expect(lanes).toEqual({ short: 0, long: 1 });
    expect(groups).toEqual([]);
  });
  it("lines that only touch don't overlap", () => {
    expect(bracketLanes([s("a", 0, 30), s("b", 30, 60)]).lanes).toEqual({ a: 0, b: 0 });
  });
  it("folds three on overlapping lines into one group", () => {
    const { lanes, groups } = bracketLanes([s("a", 0, 30), s("b", 0, 30), s("c", 0, 60)]);
    expect(lanes).toEqual({});
    expect(groups).toEqual([{ ids: ["a", "b", "c"], top: 0, bottom: 60, lane: 0 }]);
  });
  it("keeps a pinned link out of the group, nearest the text", () => {
    const { lanes, groups } = bracketLanes([s("a", 0, 30), s("b", 0, 30), s("c", 0, 60, true), s("d", 0, 30)]);
    expect(lanes).toEqual({ c: 0 });
    expect(groups).toEqual([{ ids: ["a", "b", "d"], top: 0, bottom: 30, lane: 1 }]);
  });
  it("two pinned + others: group still within the lanes", () => {
    const { lanes, groups } = bracketLanes([s("p", 0, 30, true), s("q", 0, 30, true), s("a", 0, 30)]);
    expect(lanes).toEqual({ p: 0, q: 1 });
    expect(groups[0].ids).toEqual(["a"]);
    expect(groups[0].lane).toBe(1);
  });
});

describe("connector (#211)", () => {
  it("only when the label sits over half a line from its hook", () => {
    expect(needsConnector(100, 110, 28)).toBe(false);
    expect(needsConnector(100, 115, 28)).toBe(true);
  });
  it("is a straight elbow: across, down, across", () => {
    expect(connectorPath({ x: 10, y: 20 }, { x: 30, y: 50 })).toBe("M 10.0 20.0 H 20.0 V 50.0 H 30.0");
  });
});
