/**
 * Desktop sheet fit (#51): the reading sheet always fits the pane — no
 * sideways scroll. Decides spread (2 columns) vs one centred column, and how
 * much margin the annotation lanes get. All sizes in rem; the caller converts.
 *
 * Pane = [gutter][lane][ pad | text | pad ][lane][gutter]
 * - Lanes (where untouched annotation boxes start) exist only when the
 *   chapter has annotations (LANE); note chips alone need a narrower rail
 *   (RAIL, #63); otherwise the text takes the space.
 * - Spread when both columns get at least SPREAD_MIN_COL (≈47 chars), else
 *   one column up to SINGLE_MAX (paged the same way).
 */

/** Edge gutter each side: the tool palette's column on the left, mirrored
 * on the right so the sheet stays centred (page turns live in the running
 * foot under the text block, inside the content box: clear of every lane). */
export const GUTTER = 3.75; // --spacing-reader-gutter (app.css)
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
/** Narrowest text measure the sheet ever sets: ≈30ch of the reading face
 * (Literata's 0 ≈ 0.55em at text-reading), ~40 characters of prose. Below
 * it a line holds a handful of words (large text, #61). */
export const MEASURE_MIN = 19;
/** Narrowest viewport that pages: both gutters + the minimum measure. */
export const PAGED_MIN = 2 * GUTTER + MEASURE_MIN + 2 * PAD;

export type SheetLayout = {
  columns: 1 | 2;
  /** Content box width incl. its padding (rem). */
  contentWidth: number;
  /** Margin each side of the content box for annotation boxes (rem). */
  lane: number;
};

/** `laneRem`: margin wanted each side — LANE, RAIL or 0. */
export function sheetLayout(paneRem: number, laneRem: number): SheetLayout {
  const avail = Math.max(0, paneRem - 2 * GUTTER);
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

/**
 * Large text (#61) on a smaller screen: does the paged sheet still get its
 * minimum measure? If not, the reader reflows to the phone's one scrolling
 * column (WCAG 1.4.10) — what the same window shows at 100% when it is that
 * many rem narrow. In rem, so text size and browser zoom count alike.
 */
export function pagedFits(viewportRem: number): boolean {
  return viewportRem >= PAGED_MIN;
}

/** Shortest window (rem) that heads the paged sheet with the chapter strip.
 * Strip + its air cost about two lines of the column: below this (large
 * text on a short screen, 1440×900 at 200%) that is a fifth of the page, so
 * the chapter stays a top-bar chooser instead. */
export const STRIP_MIN_HEIGHT = 32;

export function stripFits(viewportHeightRem: number): boolean {
  return viewportHeightRem >= STRIP_MIN_HEIGHT;
}

/** A margin box never gets narrower than this (annotation-marks MIN_W)… */
const BOX_MIN_PX = 90;
/** …nor than this many rem (large text sizes, #61). */
export const BOX_MIN_REM = 5;
/** px a box keeps from the pane edge (annotation-marks EDGE) + from the text. */
const BOX_CLEARANCE_PX = 52 + 8;

/** Do margin boxes fit beside the text at this layout and rem size? The
 * narrowest box, pushed against the pane edge, must end before the text
 * column (lane + edge gutter + content padding). If not, annotations print as
 * lines under their verse instead (#63) — never a box on the words. */
export function boxesFitLane(layout: SheetLayout, remPx: number): boolean {
  const roomPx = (layout.lane + GUTTER + PAD) * remPx - BOX_CLEARANCE_PX;
  return roomPx >= Math.max(BOX_MIN_PX, BOX_MIN_REM * remPx);
}

/** A horizontal span on screen (px). */
export type Span = { left: number; right: number };

/**
 * A chapter crossing moves like a page turn: the pages slide inside the
 * text box, clipped to it, the new page following right behind the old one
 * as the next page does within a chapter. The clip is the NEW chapter's box
 * — the one the running foot already shows during the slide (boxes differ
 * when only one chapter has margin lanes). Same boxes: exactly one stride.
 */
export function crossingSlide(
  dir: "prev" | "next",
  stride: number,
  oldBox: Span,
  newBox: Span,
): { distance: number; clip: Span } {
  // The gap a page turn leaves between pages (stride − box width)
  const gap = Math.max(0, stride - (oldBox.right - oldBox.left));
  const width = newBox.right - newBox.left;
  // The new page starts against the old box's far edge, and fully outside
  // the clip; the old page then ends fully outside it too
  const reach = dir === "next" ? oldBox.right - newBox.left : newBox.right - oldBox.left;
  return { distance: Math.ceil(Math.max(reach, width) + gap), clip: { ...newBox } };
}

/**
 * The running foot's centre lines (page-foot.tsx), measured as
 * `[separator, ...parts]` in px: how many parts fit `room`, counted from
 * the line's end — the last part (page count, copyright) always stays,
 * the ones before it (verse range, translation name) give way first.
 */
export function partsThatFit(widths: number[], room: number): number {
  const [sep = 0, ...parts] = widths;
  let width = 0;
  let keep = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    width += parts[i]! + (keep > 0 ? sep : 0);
    if (keep > 0 && width > room + 0.5) break;
    keep++;
  }
  return keep;
}

/** A whole foot line's width (px), from the same `[separator, ...parts]`. */
export function lineWidth(widths: number[]): number {
  const [sep = 0, ...parts] = widths;
  return parts.reduce((sum, w) => sum + w, 0) + sep * Math.max(0, parts.length - 1);
}

/**
 * The coffee link (`coffee` px) closes the credit line (`[separator,
 * ...parts]`) only where the whole line, with it, fits `room` on one line:
 * it never drops, wraps or pushes out a credit part — it goes first. (A
 * credit on its own, wrapped line is measured as set instead: page-foot.tsx.)
 */
export function coffeeFits(credit: number[], coffee: number, room: number): boolean {
  const [sep = 0, ...parts] = credit;
  if (parts.length === 0) return false;
  return lineWidth(credit) + sep + coffee <= room + 0.5;
}
