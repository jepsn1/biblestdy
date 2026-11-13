/**
 * Desktop sheet fit (#51): the reading sheet always fits the pane — no
 * sideways scroll. Decides spread (2 columns) vs one centred column, and how
 * much margin the annotation lanes get. All sizes in rem; the caller converts.
 *
 * Pane = [flip strip][lane][ pad | text | pad ][lane][flip strip]
 * - Lanes (where untouched annotation boxes start) exist only when the
 *   chapter has annotations (LANE); note chips alone need a narrower rail
 *   (RAIL, #63); otherwise the text takes the space.
 * - Spread when both columns get at least SPREAD_MIN_COL (≈47 chars), else
 *   one column up to SINGLE_MAX (paged the same way).
 */

export const FLIP_STRIP = 2; // edge gutter each side (once the page-flip strips; #52 dropped them)
export const PAD = 1.5; // content box inline padding (px-6), each side
export const COL_GAP = 3.5; // gap-x-14
export const COL_MAX = 27; // ≈55 chars/line at text-reading Literata
export const SPREAD_MIN_COL = 22;
export const SINGLE_MAX = 34;
/** Narrowest single column we squeeze lanes for; below, lanes shrink. */
export const SINGLE_MIN = 22;
export const LANE = 13.5; // 190px box + 20px gap ≈ 13.1rem, rounded up
/** Note-chip rail when the chapter has notes but no annotation boxes (#63). */
export const RAIL = 8;

export type SheetLayout = {
  columns: 1 | 2;
  /** Content box width incl. its padding (rem). */
  contentWidth: number;
  /** Margin each side of the content box for annotation boxes (rem). */
  lane: number;
};

/** `laneRem`: margin wanted each side — LANE, RAIL or 0. */
export function sheetLayout(paneRem: number, laneRem: number): SheetLayout {
  const avail = Math.max(0, paneRem - 2 * FLIP_STRIP);
  const hasLanes = laneRem > 0;
  const lanes = 2 * laneRem;
  const spreadMin = 2 * SPREAD_MIN_COL + COL_GAP + 2 * PAD;
  if (avail - lanes >= spreadMin) {
    const contentWidth = Math.min(2 * COL_MAX + COL_GAP + 2 * PAD, avail - lanes);
    return { columns: 2, contentWidth, lane: laneRem };
  }
  const singleMax = SINGLE_MAX + 2 * PAD;
  const singleMin = Math.min(SINGLE_MIN + 2 * PAD, avail);
  const contentWidth = Math.max(singleMin, Math.min(singleMax, avail - lanes));
  const lane = hasLanes ? Math.max(0, Math.min(laneRem, (avail - contentWidth) / 2)) : 0;
  return { columns: 1, contentWidth, lane };
}

/** A margin box never gets narrower than this (annotation-marks MIN_W)… */
const BOX_MIN_PX = 90;
/** …nor than this many rem (large text sizes, #61). */
export const BOX_MIN_REM = 5;
/** px a box keeps from the pane edge (annotation-marks EDGE) + from the text. */
const BOX_CLEARANCE_PX = 36 + 8;

/** Do margin boxes fit beside the text at this layout and rem size? The
 * narrowest box, pushed against the pane edge, must end before the text
 * column (lane + edge strip + content padding). If not, annotations print as
 * lines under their verse instead (#63) — never a box on the words. */
export function boxesFitLane(layout: SheetLayout, remPx: number): boolean {
  const roomPx = (layout.lane + FLIP_STRIP + PAD) * remPx - BOX_CLEARANCE_PX;
  return roomPx >= Math.max(BOX_MIN_PX, BOX_MIN_REM * remPx);
}
