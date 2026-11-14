/**
 * Wheel and trackpad page turns (paged desktop reader). Scrolling reads on:
 * down (or a two-finger swipe left) is the next page, as PgDn already is —
 * the sheet still slides sideways, like a book. One gesture turns at most
 * one page: a trackpad's inertia keeps firing wheel events for a second or
 * more, so after a turn every event is swallowed until the wheel has been
 * quiet for QUIET_MS, or a fresh push starts (deltas rise again after the
 * decay). A mouse notch (~100px) turns at once; small trackpad deltas add
 * up to THRESHOLD first.
 */

/** px of scroll that make a turn (one mouse notch is 50–120, Firefox 3 lines). */
export const THRESHOLD = 40;
/** A pause this long (ms) ends the gesture. */
export const QUIET_MS = 220;
/** Firefox's line/page delta modes, in px. */
const LINE_PX = 16;
const PAGE_PX = 400;

export type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; timeStamp: number };

/** Returns a feed: each wheel event in, "next" | "prev" | null out. */
export function wheelTurner() {
  let sum = 0;
  let last = -Infinity;
  /** Turned this gesture: swallow the rest (inertia) */
  let spent = false;
  /** Size of the previous event while spent: a rise = a new push. */
  let prevMag = 0;
  return (e: WheelSample): "next" | "prev" | null => {
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
    // The stronger axis decides: down/right = forward
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
    const mag = Math.abs(d);
    const quiet = e.timeStamp - last >= QUIET_MS;
    last = e.timeStamp;
    if (quiet || (spent && mag > 2 * prevMag && mag >= 20)) {
      spent = false;
      sum = 0;
    }
    prevMag = mag;
    if (spent || d === 0) return null;
    // A change of direction starts the count over
    if (Math.sign(d) !== Math.sign(sum)) sum = 0;
    sum += d;
    if (Math.abs(sum) < THRESHOLD) return null;
    spent = true;
    const dir = sum > 0 ? "next" : "prev";
    sum = 0;
    return dir;
  };
}

/** Could `from` (or a parent up to `root`) still scroll this way? Then the
 * wheel is theirs — a long margin note, an editor — not a page turn. */
export function scrollsItself(from: Element | null, root: Element, dx: number, dy: number): boolean {
  for (let el = from; el && el !== root; el = el.parentElement) {
    const style = getComputedStyle(el);
    const y = /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
    const x = /auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
    if (y && ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0))) return true;
    if (x && ((dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) || (dx < 0 && el.scrollLeft > 0))) return true;
  }
  return false;
}
