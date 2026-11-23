/**
 * Does a click on a chip open its preview (#213 C6)? A plain click or tap
 * does — the panel's pick over Ctrl/⌘+click, which an iPad lacks. A press
 * that travelled is a drag (selecting across the chip, Lexical's own), and
 * other buttons are the browser's. Ctrl/⌘ no longer matters: it still opens.
 */
export const CLICK_SLOP = 4;

export function chipOpensOnClick({
  mouse,
  button,
  from,
  to,
}: {
  /** A mouse (not touch or pen: their tap always opens). */
  mouse: boolean;
  button: number;
  /** Where the mouse went down on the chip; null = not on it (a drag
   * that ended here). */
  from: { x: number; y: number } | null;
  to: { x: number; y: number };
}): boolean {
  if (!mouse) return true;
  if (button !== 0 || !from) return false;
  return Math.hypot(to.x - from.x, to.y - from.y) <= CLICK_SLOP;
}

/** How far a finger may drift and still tap (px), and how long a press may
 * last before it is iOS's long press instead (ms). */
export const TAP_SLOP = 10;
export const LONG_PRESS_MS = 500;

/**
 * Does a finger lifted from a chip open its preview (#281)? It opens at
 * the lift, not at the click that follows: the press focuses the note,
 * which can fold the row above the text (tags, large text) and move the
 * chip from under the finger before that click lands — the click then
 * hits the line, not the chip. A finger that moved (a scroll) or stayed
 * (a long press) is no tap.
 */
export function touchTapOpens({
  from,
  to,
  ms,
}: {
  from: { x: number; y: number } | null;
  to: { x: number; y: number };
  ms: number;
}): boolean {
  if (!from || ms > LONG_PRESS_MS) return false;
  return Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP;
}
