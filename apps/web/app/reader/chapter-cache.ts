import type { Chapter } from "@biblestdy/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { data } from "react-router";
import i18n from "~/lib/i18n";
import { queryClient } from "~/lib/query";
import { fetchScripture } from "~/lib/scripture-fetch";
import type { ChapterRef } from "./chapter-nav";
import { parseLimit, readingLimitMessage, ReadingLimited } from "./reading-limit";
import { annotationsQuery } from "./use-annotations";
import { highlightsQuery } from "./use-highlights";
import { notesQuery } from "./use-notes";

/**
 * Chapter text lives in the query cache (scripture never changes under a
 * reader): one fetch per chapter, shared by the route loader, the run-on page
 * (ChapterSpill) and reading ahead — a request already on its way is joined,
 * never repeated. Failures are not kept: the next use tries again.
 *
 * Every chapter fetched spends the reading quota (#29: a burst, then one per
 * 2 s; a chapter already read today is free). Two kinds of fetch:
 * - needed: the chapter being opened, and what runs on to its last page.
 *   Always fetched; a short over-limit wait is sat out (skeleton, retry).
 * - read ahead (prefetchNeighbours): only while the server says the burst
 *   has more than READ_AHEAD_RESERVE left, so reading ahead never spends what
 *   the reader's own turns need; paused after a refusal until its wait ends.
 *   Marked low priority (#248): when the API.Bible call budget is tight the
 *   server answers 204 for a chapter it has not cached — nothing is kept, a
 *   use that joins it fetches for real, and reading ahead rests a while.
 */
const READ_AHEAD_RESERVE = 10;
/** The account's refill (policy.ts): estimates the burst between replies. */
const REFILL_MS = 2000;
/** Unread chapter text stays this long after its last use. */
const KEEP_MS = 30 * 60_000;
/** Header the API reads as "read-ahead, low priority" (scripture.controller). */
const PREFETCH_HEADER = "X-Scripture-Prefetch";
/** After a 204 (call budget tight), reading ahead rests this long. */
const DEFERRED_REST_MS = 5 * 60_000;

/** The server declined a read-ahead (204): not loaded, not an error to show. */
export class ReadAheadDeferred extends Error {
  constructor() {
    super("read-ahead deferred");
    this.name = "ReadAheadDeferred";
  }
}

let remaining: { tokens: number; at: number } | null = null;
let pausedUntil = 0;
let deferredUntil = 0;

function tokensLeft(now: number): number {
  if (!remaining) return Infinity; // nothing fetched yet: a full burst
  return remaining.tokens + Math.floor((now - remaining.at) / REFILL_MS);
}

/** Waiting out a refusal from the reading quota (ms left; 0 = not). */
export function readingPausedFor(): number {
  return Math.max(0, pausedUntil - Date.now());
}

async function fetchChapter(translationId: string, ref: ChapterRef, next?: string, readAhead = false): Promise<Chapter> {
  // A refusal's wait still runs: sit it out instead of earning another
  const pause = readingPausedFor();
  if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
  const res = await fetchScripture(
    `/api/passages/${translationId}/${ref.book}/${ref.chapter}`,
    next,
    readAhead ? { [PREFETCH_HEADER]: "1" } : undefined,
  );
  if (res.status === 204) {
    deferredUntil = Date.now() + DEFERRED_REST_MS;
    // Something started showing it meanwhile (an enabled observer joined this
    // request): fetch for real. Disabled observers (not needed yet) don't count
    const observed = queryClient.getQueryCache().find({ queryKey: chapterQuery(translationId, ref).queryKey });
    if (observed?.isActive()) return fetchChapter(translationId, ref, next);
    throw new ReadAheadDeferred();
  }
  if (res.status === 404 || res.status === 400) {
    throw data(i18n.t("error.chapterUnavailable"), { status: 404 });
  }
  if (res.status === 429) {
    const limit = await parseLimit(res);
    pausedUntil = Math.max(pausedUntil, Date.now() + limit.retryAfterSeconds * 1000);
    remaining = { tokens: 0, at: pausedUntil };
    throw new ReadingLimited(limit, readingLimitMessage(i18n.t, limit));
  }
  if (!res.ok) throw data(i18n.t("error.chapterLoad"), { status: 502 });
  const left = Number(res.headers.get("ratelimit-remaining") ?? NaN);
  if (Number.isFinite(left)) remaining = { tokens: left, at: Date.now() };
  return (await res.json()) as Chapter;
}

export const chapterQuery = (translationId: string, ref: ChapterRef) =>
  queryOptions({
    queryKey: ["chapter", translationId, ref.book, ref.chapter] as const,
    queryFn: () => fetchChapter(translationId, ref),
    staleTime: Infinity,
    gcTime: KEEP_MS,
    retry: false,
  });

/** Retry a short over-limit wait once it is over (a few times at most);
 * anything else fails straight away. */
export const retryWhenLimited = {
  retry: (count: number, err: unknown) => err instanceof ReadingLimited && err.shortWait && count < 5,
  retryDelay: (_count: number, err: unknown) =>
    err instanceof ReadingLimited ? err.limit.retryAfterSeconds * 1000 + 250 : 1000,
};

/** One chapter's text: from the cache when already loaded or on its way.
 * Throws the route errors the reader shows (unavailable, load) or
 * ReadingLimited (429). `next`: where sign-in returns to if the session has
 * expired (the page being opened; default the current one). */
export function loadChapter(translationId: string, ref: ChapterRef, next?: string): Promise<Chapter> {
  const load = () => queryClient.fetchQuery({ ...chapterQuery(translationId, ref), queryFn: () => fetchChapter(translationId, ref, next) });
  // Joined a read-ahead the server declined: this is the visit, fetch it
  return load().catch((err: unknown) => (err instanceof ReadAheadDeferred ? load() : Promise.reject(err)));
}

/**
 * A chapter's text for the run-on page: cached text straight away; else, once
 * `needed`, fetched (a short over-limit wait is sat out and retried).
 * `pending`: on its way or waiting out a limit (`limited`) — draw a skeleton.
 */
export function useChapterText(translationId: string, ref: ChapterRef | null, needed: boolean) {
  const q = useQuery({
    ...chapterQuery(translationId, ref ?? { book: "", chapter: 0 }),
    ...retryWhenLimited,
    enabled: !!ref && needed,
  });
  if (!ref) return { text: null, pending: false, limited: false };
  return {
    text: q.data ?? null,
    pending: !q.data && q.fetchStatus === "fetching",
    limited: !q.data && (q.failureReason instanceof ReadingLimited || readingPausedFor() > 0),
  };
}

/** Wait (briefly) for a chapter that is already on its way; never fetches. */
export function chapterArriving(translationId: string, ref: ChapterRef | null): Promise<unknown> {
  if (!ref) return Promise.resolve();
  const query = chapterQuery(translationId, ref);
  if (queryClient.getQueryState(query.queryKey)?.fetchStatus !== "fetching") return Promise.resolve();
  return queryClient.fetchQuery(query).catch(() => {}); // joins the request on its way
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

/** Fetch chapters ahead of the reader: text plus the per-chapter study data
 * the reader draws (marks decide the margin lanes, so they must be in before
 * the first paint for the page count to hold). Text already here is never
 * fetched again. `needed`: the reader is about to see it (a run-on page) —
 * fetched whatever the reserve, unless a refusal's wait still runs. */
export function prefetchNeighbours(translationId: string, refs: (ChapterRef | null)[], { needed = false } = {}) {
  const now = Date.now();
  if (now < pausedUntil) return;
  for (const ref of refs) {
    if (!ref) continue;
    const query = chapterQuery(translationId, ref);
    if (!queryClient.getQueryData(query.queryKey)) {
      if (needed) void queryClient.prefetchQuery(query); // the real visit reports errors
      else if (tokensLeft(now) <= READ_AHEAD_RESERVE || now < deferredUntil) continue;
      else void queryClient.prefetchQuery({ ...query, queryFn: () => fetchChapter(translationId, ref, undefined, true) });
    }
    const { book, chapter } = ref;
    void queryClient.prefetchQuery(highlightsQuery(translationId, book, chapter));
    void queryClient.prefetchQuery(annotationsQuery(translationId, book, chapter));
    void queryClient.prefetchQuery(notesQuery(translationId, book, chapter));
  }
}
