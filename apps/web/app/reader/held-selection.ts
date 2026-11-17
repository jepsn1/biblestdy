import type { Anchor, WordPos } from "@biblestdy/shared";

/**
 * Phone tap-select (#206, panel spec docs/reviews/2026-11-17-phone-selection-trigger.md):
 * a tap on a plain word selects it with two drag handles and a small pill
 * (Highlight · Note · More · Close). The drawer never opens by itself — More,
 * or a second tap on the selection, opens it.
 */

/** Is the word inside the anchor's range? */
export function inAnchor(a: Anchor, p: WordPos): boolean {
  const at = (v: number, w: number) => v * 100000 + w;
  const x = at(p.verse, p.word);
  return at(a.startVerse, a.startWord) <= x && x <= at(a.endVerse, a.endWord);
}

type Box = { left: number; right: number; top: number; bottom: number };

/** Clear of the end handle's knob under the last line. */
export const PILL_BELOW = 28;
/** Air above the first line when the pill flips up. */
export const PILL_ABOVE = 8;
/** Kept from the screen's sides. */
export const PILL_EDGE = 16;

/**
 * Where the pill goes (viewport px): under the last line, centred on the end
 * word, clear of its handle; above the first line when there is no room
 * below `bottom` (the screen, or an open drawer's top). Never off the sides.
 */
export function pillPlace(
  start: Box,
  end: Box,
  pill: { width: number; height: number },
  screenWidth: number,
  bottom: number,
): { left: number; top: number } {
  const centre = (r: Box) => (r.left + r.right) / 2 - pill.width / 2;
  const clampX = (x: number) => Math.max(PILL_EDGE, Math.min(x, screenWidth - PILL_EDGE - pill.width));
  const below = end.bottom + PILL_BELOW;
  if (below + pill.height <= bottom) return { left: clampX(centre(end)), top: below };
  const above = start.top - PILL_ABOVE - pill.height;
  // A selection taller than the screen: the bottom edge, over the words
  return { left: clampX(centre(above >= 0 ? start : end)), top: above >= 0 ? above : bottom - pill.height - PILL_ABOVE };
}

/** Within this far (px) of the text's top or bottom edge, a handle drag scrolls. */
export const EDGE_ZONE = 48;

/** Auto-scroll for a handle held at `y` in a viewport [top, bottom]: px per
 * frame, ramping 2 → 14 towards the edge; negative = up, 0 = not at an edge. */
export function edgeScroll(y: number, top: number, bottom: number): number {
  const ramp = (d: number) => Math.round(2 + 12 * Math.min(1, Math.max(0, 1 - d / EDGE_ZONE)));
  if (y < top + EDGE_ZONE) return -ramp(y - top);
  if (y > bottom - EDGE_ZONE) return ramp(bottom - y);
  return 0;
}
