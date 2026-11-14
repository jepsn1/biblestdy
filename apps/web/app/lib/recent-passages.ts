import type { RecentPassage } from "~/palette/palette-results";

/** Chapters read lately, newest first (palette's "Recent"). This device only. */
const KEY = "recentPassages";
const MAX = 8;

export function readRecent(): RecentPassage[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v)
      ? v.filter((r): r is RecentPassage => typeof r?.book === "string" && typeof r?.chapter === "number")
      : [];
  } catch {
    return [];
  }
}

/** Call after a chapter actually loaded. Dedupes by book + chapter. */
export function pushRecent(p: RecentPassage): void {
  try {
    const next = [p, ...readRecent().filter((r) => r.book !== p.book || r.chapter !== p.chapter)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: no recent list
  }
}
