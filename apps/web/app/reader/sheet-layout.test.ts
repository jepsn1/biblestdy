import { describe, expect, it } from "vitest";
import { boxesFitLane, FLIP_STRIP, LANE, RAIL, sheetLayout } from "./sheet-layout";

/** Everything the layout places must fit the pane: no sideways scroll. */
function fits(paneRem: number, lane: number) {
  const l = sheetLayout(paneRem, lane);
  return l.contentWidth + 2 * l.lane + 2 * FLIP_STRIP <= paneRem + 1e-9;
}

describe("sheetLayout", () => {
  it("no annotations: wide pane gets a full ~27rem-column spread, no lanes", () => {
    const l = sheetLayout(90, 0); // 1440, sidebar closed
    expect(l).toEqual({ columns: 2, contentWidth: 60.5, lane: 0 });
  });

  it("no annotations: 1024 still reads as a spread", () => {
    const l = sheetLayout(64, 0);
    expect(l.columns).toBe(2);
    expect(l.lane).toBe(0);
  });

  it("annotations reserve 13.5rem lanes each side", () => {
    expect(sheetLayout(120, LANE)).toEqual({ columns: 2, contentWidth: 60.5, lane: 13.5 });
  });

  it("annotations on a mid pane: one centred column plus lanes, not a squeezed spread", () => {
    const l = sheetLayout(80, LANE); // 1280, sidebar closed
    expect(l.columns).toBe(1);
    expect(l.lane).toBe(13.5);
    expect(l.contentWidth).toBe(37); // 34rem column + padding
  });

  it("narrow pane (note open): one column, lanes shrink before the column does", () => {
    const l = sheetLayout(40, LANE);
    expect(l.columns).toBe(1);
    expect(l.contentWidth).toBe(25);
    expect(l.lane).toBeCloseTo(5.5);
  });

  it("notes only: a narrower chip rail keeps the spread", () => {
    expect(sheetLayout(90, RAIL)).toEqual({ columns: 2, contentWidth: 60.5, lane: RAIL });
  });

  it("never overflows the pane", () => {
    for (let pane = 20; pane <= 160; pane += 0.5) {
      expect(fits(pane, 0), `pane ${pane}`).toBe(true);
      expect(fits(pane, LANE), `pane ${pane} lanes`).toBe(true);
      expect(fits(pane, RAIL), `pane ${pane} rail`).toBe(true);
    }
  });
});

describe("boxesFitLane", () => {
  it("full lanes at 100% hold margin boxes", () => {
    expect(boxesFitLane(sheetLayout(74, LANE), 16)).toBe(true); // 1440 with sidebar
  });

  it("200% text squeezes the lane to a sliver: boxes go inline", () => {
    // 1440 with sidebar at 200%: (1440 - 512) / 32 = 29rem pane
    expect(boxesFitLane(sheetLayout(29, LANE), 32)).toBe(false);
  });

  it("the same pane at 100% with a note panel open (40rem) still fits", () => {
    expect(boxesFitLane(sheetLayout(40, LANE), 16)).toBe(true);
  });
});
