import type { Rect } from "./ink-geometry";

/**
 * A word span's boxes, one per line it sits on (viewport px). A long word
 * at large text on a narrow phone hyphenates or breaks over two lines
 * (#240): its bounding box would then span both lines, the full column
 * wide — the ink measures each line's piece instead. (A browser may give
 * a rect per text node — the word, its space — so pieces on one line merge.)
 */
export function wordRects(el: Pick<Element, "getClientRects">): Rect[] {
  const lines: Rect[] = [];
  for (const r of Array.from(el.getClientRects())) {
    if (r.width === 0) continue;
    const mid = (r.top + r.bottom) / 2;
    const l = lines.find((l) => mid > l.top && mid < l.bottom);
    if (!l) lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    else {
      l.left = Math.min(l.left, r.left);
      l.top = Math.min(l.top, r.top);
      l.right = Math.max(l.right, r.right);
      l.bottom = Math.max(l.bottom, r.bottom);
    }
  }
  return lines;
}

/** Where a word starts and ends: its first and last line's pieces. */
export function wordEnds(el: Pick<Element, "getClientRects">): { first: Rect; last: Rect } | null {
  const rects = wordRects(el);
  return rects.length ? { first: rects[0], last: rects[rects.length - 1] } : null;
}
