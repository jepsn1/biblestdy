import { describe, expect, it } from "vitest";
import {
  boxesFitLane,
  coffeeFits,
  crossingSlide,
  GUTTER,
  LANE,
  lineWidth,
  MEASURE_MIN,
  PAD,
  pagedFits,
  partsThatFit,
  RAIL,
  sheetLayout,
  stripFits,
} from "./sheet-layout";

/** Everything the layout places must fit the pane: no sideways scroll. */
function fits(paneRem: number, lane: number) {
  const l = sheetLayout(paneRem, lane);
  return l.contentWidth + 2 * l.lane + 2 * GUTTER <= paneRem + 1e-9;
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
    expect(l.lane).toBeCloseTo(3.75);
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

/** A window `px` wide at a text size (%) — or browser zoom — in rem. */
const rem = (px: number, size = 100) => px / (16 * size / 100);

describe("large text: paging, measure", () => {
  it("1024 and 1440 page at every text size; browser zoom 200% at 1280 too", () => {
    for (const size of [100, 125, 150, 175, 200]) {
      expect(pagedFits(rem(1024, size)), `1024 ${size}%`).toBe(true);
      expect(pagedFits(rem(1440, size)), `1440 ${size}%`).toBe(true);
    }
    expect(pagedFits(rem(640))).toBe(true);
  });

  it("a window too narrow for the measure at its text size reflows to one scrolling column", () => {
    expect(pagedFits(rem(800, 200))).toBe(false);
    expect(pagedFits(rem(900, 175))).toBe(true);
  });

  it("wherever it pages, the text keeps at least the minimum measure (≈30ch)", () => {
    for (let viewport = 20; viewport <= 160; viewport += 0.25) {
      if (!pagedFits(viewport)) continue;
      const pane = viewport;
      for (const lane of [0, RAIL, LANE]) {
        const text = sheetLayout(pane, lane).contentWidth - 2 * PAD;
        expect(text, `viewport ${viewport}rem, lane ${lane}`).toBeGreaterThanOrEqual(MEASURE_MIN);
      }
    }
  });
});

describe("chapter strip", () => {
  it("heads the sheet on every common screen up to 150% text", () => {
    for (const h of [768, 800, 900, 1080]) {
      for (const size of [100, 125, 150]) expect(stripFits(rem(h, size)), `${h}px ${size}%`).toBe(true);
    }
  });

  it("steps aside where it would cost a short page a fifth of its lines", () => {
    expect(stripFits(rem(900, 200))).toBe(false);
    expect(stripFits(rem(800, 175))).toBe(false);
    expect(stripFits(rem(1080, 200))).toBe(true);
  });
});

describe("running foot fit", () => {
  // [separator, verse range, page count] in px
  const folio = [12, 60, 120];

  it("room for the whole line: every part", () => {
    expect(partsThatFit(folio, 200)).toBe(2);
    expect(lineWidth(folio)).toBe(192);
  });

  it("short of room: the leading part gives way, the last stays", () => {
    expect(partsThatFit(folio, 191)).toBe(1);
    expect(partsThatFit(folio, 40)).toBe(1); // last resort: truncated, never dropped
  });

  it("empty line: nothing to keep", () => {
    expect(partsThatFit([12], 100)).toBe(0);
    expect(lineWidth([12])).toBe(0);
  });
});

describe("coffee link fit", () => {
  // credit line [separator, translation name, copyright · source] in px
  const credit = [12, 80, 300]; // 392 wide
  const coffee = 110;

  it("spare room on the credit line: it closes the line", () => {
    expect(coffeeFits(credit, coffee, 514)).toBe(true); // 392 + 12 + 110
  });

  it("short of room: the coffee goes first, every credit part stays", () => {
    expect(coffeeFits(credit, coffee, 500)).toBe(false);
    expect(partsThatFit(credit, 500)).toBe(2);
  });

  it("no credit line: no coffee there", () => {
    expect(coffeeFits([12], coffee, 1000)).toBe(false);
  });
});

describe("boxesFitLane", () => {
  it("full lanes at 100% hold margin boxes", () => {
    expect(boxesFitLane(sheetLayout(74, LANE), 16)).toBe(true); // a 74rem pane
  });

  it("200% text squeezes the lane to a sliver: boxes go inline", () => {
    // a 29rem pane at 200% (a note panel open)
    expect(boxesFitLane(sheetLayout(29, LANE), 32)).toBe(false);
  });

  it("with a note panel open, boxes fit from a 42rem pane at 100% (40rem: inline lines)", () => {
    expect(boxesFitLane(sheetLayout(42, LANE), 16)).toBe(true);
    expect(boxesFitLane(sheetLayout(40, LANE), 16)).toBe(false);
  });
});

describe("crossingSlide", () => {
  it("same box: one page stride, clipped to the box (an in-chapter turn)", () => {
    const box = { left: 400, right: 1368 };
    expect(crossingSlide("next", 976, box, box)).toEqual({ distance: 976, clip: box });
    expect(crossingSlide("prev", 976, box, box)).toEqual({ distance: 976, clip: box });
  });

  it("boxes differ: the new page follows right behind the old one", () => {
    const wide = { left: 400, right: 1368 };
    const narrow = { left: 600, right: 1160 };
    // next: the new page starts at the old box's right edge (+ the turn's gap)
    const next = crossingSlide("next", 976, wide, narrow);
    expect(narrow.left + next.distance).toBe(wide.right + 8);
    // prev into a wider box: it must start outside its own clip
    const prev = crossingSlide("prev", 568, narrow, wide);
    expect(wide.right - prev.distance).toBeLessThanOrEqual(prev.clip.left);
    expect(narrow.left + prev.distance).toBeGreaterThanOrEqual(prev.clip.right);
  });

  it("boxes differ: the new box clips (as the foot shows); neither page is left in it", () => {
    const wide = { left: 400, right: 1368 };
    const narrow = { left: 600, right: 1160 };
    const next = crossingSlide("next", 976, wide, narrow);
    expect(next.clip).toEqual(narrow);
    expect(wide.right - next.distance).toBeLessThanOrEqual(next.clip.left); // old out
    expect(narrow.left + next.distance).toBeGreaterThanOrEqual(next.clip.right); // new starts out
    const prev = crossingSlide("prev", 568, narrow, wide);
    expect(prev.clip).toEqual(wide);
    expect(narrow.left + prev.distance).toBeGreaterThanOrEqual(prev.clip.right);
    expect(wide.right - prev.distance).toBeLessThanOrEqual(prev.clip.left);
  });
});
