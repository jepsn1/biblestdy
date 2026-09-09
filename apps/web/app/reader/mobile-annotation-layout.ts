/**
 * Mobile annotation layout (issue #15). On phones the desktop's hand-placed
 * box offsets are meaningless — this pure module computes deterministic
 * placements instead: every box sits directly BELOW its anchor's last text
 * line, near-column width, and boxes anchored to the same/overlapping lines
 * stack downward in text order. Plain data in, plain data out — no DOM, no DB.
 *
 * Callers pass annotations in text order (anchor order in the chapter); the
 * output keeps that order. All coordinates share one space (the caller's —
 * in practice the reader region's local px).
 */

/** Rect of one text line the anchor's words cover. */
export type LineRect = { x: number; y: number; w: number; h: number };

/** Geometry of the column the anchor sits in. */
export type ColumnGeometry = {
  /** Column left edge. */
  x: number;
  /** Column width. */
  width: number;
  /** Column top edge. */
  top: number;
  /** Column height — boxes are clamped to stay inside `top..top+height`. */
  height: number;
  /** Text line height — a box lands below the full line slot, not on descenders. */
  lineHeight: number;
};

export type LayoutInput = {
  id: string;
  /** Rects of the anchor's text lines, text order — last one owns the box. */
  lineRects: LineRect[];
  /** Measured box height; DEFAULT_BOX_HEIGHT when not yet measured. */
  height?: number;
};

/** A computed box placement: top-left corner + width. */
export type BoxPlacement = { id: string; x: number; y: number; width: number };

/** Boxes sit this far inside each column edge (near-column width). */
export const BOX_INSET = 10;
/** Gap between the anchor's line slot and the box below it. */
export const LINE_GAP = 4;
/** Gap between stacked boxes. */
export const STACK_GAP = 6;
/** One-line handwriting box until the renderer measures the real height. */
export const DEFAULT_BOX_HEIGHT = 22;

export function layoutMobileAnnotations(
  annotations: LayoutInput[],
  column: ColumnGeometry,
): BoxPlacement[] {
  const x = column.x + BOX_INSET;
  const width = Math.max(0, column.width - BOX_INSET * 2);
  const columnBottom = column.top + column.height;
  const placed: { y: number; h: number }[] = []; // kept sorted by y
  const out: BoxPlacement[] = [];

  for (const a of annotations) {
    const last = a.lineRects[a.lineRects.length - 1];
    if (!last) continue; // anchor not on this page — nothing to place
    const h = a.height ?? DEFAULT_BOX_HEIGHT;
    // Directly below the last line's full slot (line height beats the glyph
    // box, so the box clears descenders of a short rect).
    let y = last.y + Math.max(last.h, column.lineHeight) + LINE_GAP;
    // Boxes span the same near-column width, so any vertical overlap is a
    // collision: walk earlier boxes upward-to-downward and push below each
    // one we'd touch. Ascending order makes a single pass sufficient.
    for (const p of placed) {
      if (y < p.y + p.h + STACK_GAP && y + h > p.y) y = p.y + p.h + STACK_GAP;
    }
    // Anchor near the column's last line: keep the whole box inside the column.
    y = Math.min(y, columnBottom - h);
    y = Math.max(y, column.top);
    const idx = placed.findIndex((p) => p.y > y);
    placed.splice(idx === -1 ? placed.length : idx, 0, { y, h });
    out.push({ id: a.id, x, y, width });
  }
  return out;
}
