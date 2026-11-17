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
