import type { RecentPassage } from "~/palette/palette-results";

/**
 * Chapters read lately, newest first, each with the page last open on it
 * (#142: the palette's and the address chooser's "Recent" and "Continue").
 * This device only — the panel's call (2026-11-16): nothing about your
 * reading leaves it; account sync comes with reading progress (#139).
 */
const KEY = "recentPassages";
const MAX = 8;

export function readRecent(): RecentPassage[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v)
      ? v
          .filter((r): r is RecentPassage => typeof r?.book === "string" && typeof r?.chapter === "number")
          .map((r) => (Number.isInteger(r.page) && r.page! > 0 ? r : { book: r.book, chapter: r.chapter }))
      : [];
  } catch {
    return [];
  }
}

function write(list: RecentPassage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage blocked: no recent list
  }
}

const same = (a: RecentPassage, b: RecentPassage) => a.book === b.book && a.chapter === b.chapter;

/** Call after a chapter actually loaded: it moves to the front. Dedupes by
 * book + chapter, keeping the page it was last read on. */
export function pushRecent(p: RecentPassage): void {
  const list = readRecent();
  const kept = list.find((r) => same(r, p));
  write([{ ...kept, ...p }, ...list.filter((r) => !same(r, p))].slice(0, MAX));
}

/** The reader is on `page` (0-based) of a chapter in the list. */
export function notePage(p: RecentPassage, page: number): void {
  const list = readRecent();
  const at = list.findIndex((r) => same(r, p));
  if (at < 0 || (list[at].page ?? 0) === page) return;
  list[at] = page > 0 ? { book: p.book, chapter: p.chapter, page } : { book: p.book, chapter: p.chapter };
  write(list);
}

/** Good places to start (#142), canonical order; each with a plain line that
 * quotes the text or names the kind of book, never commentary (Ruth). */
export const START_PLACES = [
  { book: "GEN", chapter: 1, line: "beginning" },
  { book: "PSA", chapter: 23, line: "shepherd" },
  { book: "MRK", chapter: 1, line: "jesus" },
  { book: "JHN", chapter: 1, line: "word" },
] as const;

/** Offered while the reader has read fewer chapters than this (the list is
 * distinct chapters and never shrinks, so its length counts them). */
export const NEWCOMER_BELOW = 3;

/**
 * What the chooser and the empty palette offer: "Continue" = the newest
 * place that isn't this chapter (inside the reader this chapter is always
 * the newest — continuing it means nothing; going back to where you were
 * before you jumped does), then up to `max` − 1 more; the start places
 * for a newcomer.
 */
export function placesToOffer(
  recent: RecentPassage[],
  here: RecentPassage | null,
  max = 5,
): { continueAt: RecentPassage | null; recent: RecentPassage[]; start: boolean } {
  const others = recent.filter((r, i) => (!here || !same(r, here)) && recent.findIndex((x) => same(x, r)) === i);
  return { continueAt: others[0] ?? null, recent: others.slice(1, max), start: recent.length < NEWCOMER_BELOW };
}
