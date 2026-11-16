/**
 * The chapter strip's one row (chapter-strip.tsx): which chapter numbers it
 * shows in `slots` places. A book that fits shows every chapter; a longer one
 * (Psalms' 150) shows the first and last, a run around the current chapter
 * and a gap ("…") either side. "All chapters" (the address chooser's grid)
 * sits after the row, for every book (#147), outside these slots. Pure: the
 * component only measures how many slots fit.
 */

export type StripItem =
  | { kind: "chapter"; n: number }
  | { kind: "gap"; side: "start" | "end" };

export type StripWindow = {
  items: StripItem[];
  /** Where the run was asked to start (null: all fit) — passed back as
   * `keep`, so the run stays put while the reader clicks inside it. */
  start: number | null;
};

/** Fewest slots the row ever lays out: 1 … n … last. */
export const STRIP_MIN_SLOTS = 5;

export function stripWindow({
  count,
  current,
  slots,
  keep = null,
}: {
  count: number;
  current: number;
  slots: number;
  /** `start` from last time: the run stays put while it shows `current`. */
  keep?: number | null;
}): StripWindow {
  const range = (from: number, to: number): StripItem[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ kind: "chapter", n: from + i }));
  if (count <= slots) return { items: range(1, count), start: null };

  // First, last and both gaps take four slots; the run has the rest
  const avail = Math.max(slots, STRIP_MIN_SLOTS);
  const run = avail - 4;
  /** The numbers in a row between the gaps, for a run starting at `start`.
   * Near either end the run joins it: no gap standing in for one chapter. */
  const span = (start: number): [number, number] => {
    const s = Math.max(2, Math.min(start, count - run));
    if (s <= 3) return [1, avail - 2];
    if (s + run - 1 >= count - 2) return [count - avail + 3, count];
    return [s, s + run - 1];
  };
  // Sticky: while the current chapter is inside the run with a neighbour
  // either side (or the run reaches that end of the book), the numbers never
  // move under the mouse. An edge number recentres, so the next ones show.
  const inside = ([lo, hi]: [number, number]) =>
    (current > lo || lo === 1) && (current < hi || hi === count) && current >= lo && current <= hi;
  const start = keep !== null && inside(span(keep)) ? keep : current - Math.floor((run - 1) / 2);
  const [lo, hi] = span(start);
  return {
    items: [
      ...(lo > 1 ? [...range(1, 1), { kind: "gap", side: "start" } as const] : []),
      ...range(lo, hi),
      ...(hi < count ? [{ kind: "gap", side: "end" } as const, ...range(count, count)] : []),
    ],
    start,
  };
}
