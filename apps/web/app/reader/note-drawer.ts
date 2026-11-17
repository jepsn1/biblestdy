/**
 * The phone note drawer's two heights (#215, unified-note-refs panel, build
 * issue 9): a peek and full. The peek leaves the text above it the reader's
 * own (no overlay, focus not trapped, it scrolls and takes taps); a
 * spotlight never runs under the full drawer.
 *
 * - Phones (one scrolling column): the peek is 45% of the screen — the
 *   note's title and its references stay in view, the passage scrolls to the
 *   top above it.
 * - A paged sheet in a drawer (large text, narrow panes): the sheet can't
 *   scroll, so the peek is the bar alone ("Back to note", and the
 *   spotlight's exit line while there is one).
 */
export const NOTE_PEEK = 0.45;
export const NOTE_FULL = 1;
export type NoteSnap = number | string;

/** The peek's snap point (base-ui `snapPoints`: a fraction or rem). */
export function peekPoint(scrollMode: boolean, exitLine: boolean): NoteSnap {
  if (scrollMode) return NOTE_PEEK;
  return exitLine ? "7.5rem" : "4.5rem";
}

/** Where a passage's first line lands in the phone's scroll pane, px from
 * its top: the upper third — or, with the note peeking over the lower part,
 * near the top (three lines' air at most), so the passage shows above it. */
export function passageInset(paneHeight: number, peek: boolean, rem: number): number {
  return peek ? Math.min(paneHeight / 3, 3 * rem) : paneHeight / 3;
}

/** Closing a note goes back to where the reader was (#203's rule, phones)
 * only if the text is still where the note put it: the reader didn't scroll
 * meanwhile (a pixel or two of rounding aside). */
export function returnsTo(scrollTop: number, back: { from: number; to: number }): boolean {
  return Math.abs(scrollTop - back.to) <= 2 && Math.abs(back.from - back.to) > 2;
}
