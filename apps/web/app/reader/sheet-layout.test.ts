import { describe, expect, it } from "vitest";
import { FLIP_STRIP, sheetLayout } from "./sheet-layout";

/** Everything the layout places must fit the pane: no sideways scroll. */
function fits(paneRem: number, hasLanes: boolean) {
  const l = sheetLayout(paneRem, hasLanes);
  return l.contentWidth + 2 * l.lane + 2 * FLIP_STRIP <= paneRem + 1e-9;
}

describe("sheetLayout", () => {
  it("no annotations: wide pane gets a full ~27rem-column spread, no lanes", () => {
    const l = sheetLayout(90, false); // 1440, sidebar closed
    expect(l).toEqual({ columns: 2, contentWidth: 60.5, lane: 0 });
  });

  it("no annotations: 1024 still reads as a spread", () => {
    const l = sheetLayout(64, false);
    expect(l.columns).toBe(2);
    expect(l.lane).toBe(0);
  });

  it("annotations reserve 13.5rem lanes each side", () => {
    expect(sheetLayout(120, true)).toEqual({ columns: 2, contentWidth: 60.5, lane: 13.5 });
  });

  it("annotations on a mid pane: one centred column plus lanes, not a squeezed spread", () => {
    const l = sheetLayout(80, true); // 1280, sidebar closed
    expect(l.columns).toBe(1);
    expect(l.lane).toBe(13.5);
    expect(l.contentWidth).toBe(37); // 34rem column + padding
  });

  it("narrow pane (note open): one column, lanes shrink before the column does", () => {
    const l = sheetLayout(40, true);
    expect(l.columns).toBe(1);
    expect(l.contentWidth).toBe(25);
    expect(l.lane).toBeCloseTo(5.5);
  });

  it("never overflows the pane", () => {
    for (let pane = 20; pane <= 160; pane += 0.5) {
      expect(fits(pane, false), `pane ${pane}`).toBe(true);
      expect(fits(pane, true), `pane ${pane} lanes`).toBe(true);
    }
  });
});
