import { BOOKS, bookIndex } from "@biblestdy/shared";

/**
 * Reader navigation (#52): where prev/next go and how a place is kept.
 * - Chapters step across book boundaries (John 21 → Acts 1, Acts 1 ← John 21).
 * - Stepping BACK from a chapter's first page lands on the previous chapter's
 *   LAST page (`?p=last`, resolved once the spread is measured).
 * - The page lives in the URL as 1-based `?p=N` (absent = page 1), so
 *   refresh/back keep it; lastRead stores the same href for the launch page.
 */

export type ChapterRef = { book: string; chapter: number };

/** The chapter before/after, continuing into the neighbouring book; null at
 * Genesis 1 / Revelation 22 (or for an unknown book). */
export function adjacentChapter(ref: ChapterRef, dir: -1 | 1): ChapterRef | null {
  const i = bookIndex(ref.book);
  if (i < 0) return null;
  const book = BOOKS[i];
  const next = ref.chapter + dir;
  if (next >= 1 && next <= book.chapters) return { book: book.id, chapter: next };
  const neighbour = BOOKS[i + dir];
  if (!neighbour) return null;
  return { book: neighbour.id, chapter: dir === 1 ? 1 : neighbour.chapters };
}

/** Wanted page from `?p=`: "last", a 0-based index, or 0 when absent/bad. */
export type WantedPage = number | "last";

export function parsePageParam(value: string | null): WantedPage {
  if (value === "last") return "last";
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}

/** Clamp a wanted page into a measured page count (0-based). */
export function resolvePage(wanted: WantedPage, pageCount: number): number {
  const last = Math.max(0, pageCount - 1);
  return wanted === "last" ? last : Math.min(Math.max(0, wanted), last);
}

/** `/read/JHN/3`, `/read/JHN/3?p=2`, `/read/JHN/2?p=last`. `page` is 0-based. */
export function chapterHref(ref: ChapterRef, page: number | "last" = 0): string {
  const base = `/read/${ref.book}/${ref.chapter}`;
  if (page === "last") return `${base}?p=last`;
  return page > 0 ? `${base}?p=${page + 1}` : base;
}

/** Launch page from the stored lastRead ("JHN/3" or "JHN/3?p=2"), else null. */
export function lastReadHref(stored: string | null): string | null {
  const m = /^([A-Z0-9]{3})\/(\d+)(?:\?p=(\d+))?$/.exec(stored ?? "");
  if (!m) return null;
  const page = m[3] ? Number(m[3]) - 1 : 0;
  return chapterHref({ book: m[1], chapter: Number(m[2]) }, page);
}

/** The lastRead value for a place (0-based page). */
export function lastReadValue(ref: ChapterRef, page: number): string {
  return chapterHref(ref, page).replace(/^\/read\//, "");
}
