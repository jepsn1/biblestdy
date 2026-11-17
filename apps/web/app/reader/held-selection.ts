import type { Anchor, WordPos } from "@biblestdy/shared";

/**
 * Phone tap-select (#206): a tap on a plain word selects it with two drag
 * handles and opens nothing — the words stay in view while the range is
 * adjusted. The selection is "held" until something on this list opens its
 * drawer, or a tap elsewhere / a scroll drops it.
 *
 * Which gestures open the drawer is a product call still open (owner +
 * panel): it lives here alone, so the reader never needs to change for it.
 */
export type HeldGesture =
  /** A tap on a word inside the held selection. */
  | "tap-selection"
  /** A selection handle let go (after a drag, or a plain tap on it). */
  | "handle-release";

const OPENS_DRAWER: Record<HeldGesture, boolean> = {
  "tap-selection": true,
  "handle-release": true,
};

/** Does this gesture on a held selection open the selection drawer? */
export const opensDrawer = (g: HeldGesture): boolean => OPENS_DRAWER[g];

/** Is the word inside the anchor's range? */
export function inAnchor(a: Anchor, p: WordPos): boolean {
  const at = (v: number, w: number) => v * 100000 + w;
  const x = at(p.verse, p.word);
  return at(a.startVerse, a.startWord) <= x && x <= at(a.endVerse, a.endWord);
}
