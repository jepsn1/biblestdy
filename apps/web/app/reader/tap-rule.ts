/**
 * Tap vs scroll on the text (#195). A touch on the words only counts as a
 * tap — open a note, select a word — when it is a deliberate press: it
 * barely moved and it was short. Everything else is the reader scrolling,
 * flinging, stopping a fling or resting a thumb, and must never open
 * anything.
 *
 * Touch taps go through `click`, never `pointerup`: the browser fires no
 * click for a scroll, a page swipe or the touch that stops a fling, but it
 * does fire pointerup for that last one — which is how scrolling kept
 * opening the note drawer. This rule is the second fence, for the presses
 * a browser still turns into a click (a slow drag under its own slop, a
 * long hold).
 */

/** How far a tap may wander (CSS px) — a fingertip's wobble, not a scroll. */
export const TAP_SLOP_PX = 10;
/** How long a tap may last (ms) — longer is a hold, not a tap. */
export const TAP_MAX_MS = 500;

export interface Press {
  x: number;
  y: number;
  /** event.timeStamp at pointerdown */
  at: number;
  /** Farthest the pointer got from (x, y) while down. */
  travel: number;
}

export const startPress = (x: number, y: number, at: number): Press => ({ x, y, at, travel: 0 });

/** The press, with the pointer now at (x, y). */
export const movePress = (p: Press, x: number, y: number): Press => ({
  ...p,
  travel: Math.max(p.travel, Math.hypot(x - p.x, y - p.y)),
});

/** Is a press released (or clicked) at (x, y), time `at`, a tap? */
export function isTap(p: Press, x: number, y: number, at: number): boolean {
  const travel = movePress(p, x, y).travel;
  return travel <= TAP_SLOP_PX && at - p.at <= TAP_MAX_MS;
}
