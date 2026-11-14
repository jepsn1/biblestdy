import { HIGHLIGHT_COLORS, type HighlightColor } from "@biblestdy/shared";
import { useSyncExternalStore } from "react";

/**
 * Which highlight colours the reader shows (the colour key's filter).
 * null = all. Lives for the session only, across chapters: a reload shows
 * every highlight again, so nobody loses marks to a filter they forgot.
 */
export type HighlightFilter = ReadonlySet<HighlightColor> | null;

let filter: HighlightFilter = null;
let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
export function setHighlightFilter(next: HighlightFilter) {
  filter = next;
  listeners.forEach((l) => l());
}

export function useHighlightFilter(): HighlightFilter {
  return useSyncExternalStore(subscribe, () => filter, () => null);
}

/**
 * A click in the key: with nothing filtered, the colour clicked is the only
 * one shown; then each click toggles that colour (a hidden one comes back).
 * Hiding the last shown one — or showing all six — is "all" again.
 */
export function toggleColor(current: HighlightFilter, color: HighlightColor): HighlightFilter {
  if (!current) return new Set([color]);
  const next = new Set(current);
  if (next.has(color)) next.delete(color);
  else next.add(color);
  return next.size === 0 || next.size === HIGHLIGHT_COLORS.length ? null : next;
}

/** Highlighting in a hidden colour shows it again (a new mark never vanishes). */
export function revealColor(current: HighlightFilter, color: HighlightColor): HighlightFilter {
  return current && !current.has(color) ? toggleColor(current, color) : current;
}

export function isShown(current: HighlightFilter, color: HighlightColor): boolean {
  return !current || current.has(color);
}
