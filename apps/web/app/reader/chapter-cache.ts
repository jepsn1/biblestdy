import type { Chapter } from "@biblestdy/shared";
import { useSyncExternalStore } from "react";
import { data } from "react-router";
import i18n from "~/lib/i18n";
import { queryClient } from "~/lib/query";
import { fetchScripture } from "~/lib/scripture-fetch";
import type { ChapterRef } from "./chapter-nav";
import { readingLimitError } from "./reading-limit";
import { annotationsQuery } from "./use-annotations";
import { highlightsQuery } from "./use-highlights";
import { notesQuery, otherVersionsQuery } from "./use-notes";

/**
 * Chapter text, kept for the page load (scripture never changes under a
 * reader), so a chapter turn renders from memory with no loading pause. The
 * neighbours are fetched ahead while the reader reads (prefetchNeighbours).
 * Failures are never kept: the next load tries again.
 */
const MAX_KEPT = 30;
const kept = new Map<string, Promise<Chapter>>();
/** Loaded texts, readable without waiting (the run-on page draws from it). */
const settled = new WeakMap<Promise<Chapter>, Chapter>();
const listeners = new Set<() => void>();
/** Reading ahead must never be what runs a reader into the reading quota
 * (#29: 20 at once, then one per 3 s): it only fetches while this tab has
 * fetched fewer than PREFETCH_BUDGET chapters in the last minute (reading
 * on costs one — the chapter behind is already here), and a refusal stops
 * it for a while. */
const PREFETCH_BUDGET = 6;
const fetchedAt: number[] = [];
let limitedUntil = 0;
const LIMIT_PAUSE_MS = 10 * 60_000;

function budgetLeft(now: number) {
  while (fetchedAt.length && fetchedAt[0] < now - 60_000) fetchedAt.shift();
  return fetchedAt.length < PREFETCH_BUDGET;
}

const keyOf = (translationId: string, ref: ChapterRef) => `${translationId}/${ref.book}/${ref.chapter}`;

async function fetchChapter(translationId: string, ref: ChapterRef): Promise<Chapter> {
  fetchedAt.push(Date.now());
  const res = await fetchScripture(`/api/passages/${translationId}/${ref.book}/${ref.chapter}`);
  if (res.status === 404 || res.status === 400) {
    throw data(i18n.t("error.chapterUnavailable"), { status: 404 });
  }
  // Over the reading quota (#29): friendly wait message, no auto-retry
  if (res.status === 429) limitedUntil = Date.now() + LIMIT_PAUSE_MS;
  const limit = await readingLimitError(res, i18n.t);
  if (limit) throw limit;
  if (!res.ok) throw data(i18n.t("error.chapterLoad"), { status: 502 });
  return (await res.json()) as Chapter;
}

/** One chapter's text: from memory when already loaded or prefetched.
 * Throws the route errors the reader shows (unavailable, limit, load). */
export function loadChapter(translationId: string, ref: ChapterRef): Promise<Chapter> {
  const key = keyOf(translationId, ref);
  let entry = kept.get(key);
  if (entry) kept.delete(key); // re-insert: most recently used last
  else {
    entry = fetchChapter(translationId, ref);
    const mine = entry;
    entry.then(
      (chapter) => {
        settled.set(mine, chapter);
        for (const listener of listeners) listener();
      },
      () => {
        if (kept.get(key) === mine) kept.delete(key);
      },
    );
  }
  kept.set(key, entry);
  while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
  return entry;
}

/** A chapter's text if it is already here (read or read ahead), else null —
 * never fetches. Re-renders when it arrives. */
export function useLoadedChapter(translationId: string, ref: ChapterRef | null): Chapter | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => {
      const entry = ref && kept.get(keyOf(translationId, ref));
      return (entry && settled.get(entry)) ?? null;
    },
    () => null,
  );
}

/** Wait (briefly) for a chapter that is already on its way; never fetches. */
export function chapterArriving(translationId: string, ref: ChapterRef | null): Promise<unknown> {
  return (ref && kept.get(keyOf(translationId, ref))) ?? Promise.resolve();
}

/** One chapter ready to draw: its text and the study data the reader lays
 * out with it — from memory when read ahead, else fetched now (that fetch is
 * the visit itself: the route's loader then reuses it). Never rejects; the
 * real visit reports errors. */
export function warmChapter(translationId: string, ref: ChapterRef): Promise<unknown> {
  const { book, chapter } = ref;
  return Promise.allSettled([
    loadChapter(translationId, ref),
    queryClient.ensureQueryData(highlightsQuery(translationId, book, chapter)),
    queryClient.ensureQueryData(annotationsQuery(translationId, book, chapter)),
    queryClient.ensureQueryData(notesQuery(translationId, book, chapter)),
  ]);
}

/** Fetch the chapters either side ahead of the reader: text plus the
 * per-chapter study data the reader draws (marks decide the margin lanes,
 * so they must be in before the first paint for the page count to hold). */
export function prefetchNeighbours(translationId: string, refs: (ChapterRef | null)[]) {
  const now = Date.now();
  if (now < limitedUntil) return;
  for (const ref of refs) {
    if (!ref || (!kept.has(keyOf(translationId, ref)) && !budgetLeft(now))) continue;
    loadChapter(translationId, ref).catch(() => {}); // the real visit reports errors
    const { book, chapter } = ref;
    void queryClient.prefetchQuery(highlightsQuery(translationId, book, chapter));
    void queryClient.prefetchQuery(annotationsQuery(translationId, book, chapter));
    void queryClient.prefetchQuery(notesQuery(translationId, book, chapter));
    void queryClient.prefetchQuery(otherVersionsQuery(translationId, book, chapter));
  }
}
