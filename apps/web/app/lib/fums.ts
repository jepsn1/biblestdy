import type { Chapter } from "@biblestdy/shared";
import { useEffect } from "react";
import { apiUrl } from "./api-base";

/**
 * API.Bible Fair Use (FUMS, ToS §3.3): every chapter actually shown is
 * reported once with its token. Reported through our own API, which relays
 * to API.Bible (apps/api/src/fums) — nothing stored on the device, no
 * third-party request from the browser. Fetched-but-unseen text (reading
 * ahead) is never reported; a chapter served from any cache still is, with
 * the token it was fetched with.
 */

/** One showing, not one per re-render: a token seen again within this
 * window (Strict Mode, a remount on resize) isn't a new view. */
const SAME_VIEW_MS = 10_000;
/** Gather the tokens of one screen (chapter + its run-on) into one request. */
const BATCH_MS = 300;

const lastReported = new Map<string, number>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Queue a view; returns whether it counted (false = same view). */
export function noteView(token: string, now = Date.now()): boolean {
  const last = lastReported.get(token);
  if (last !== undefined && now - last < SAME_VIEW_MS) return false;
  lastReported.set(token, now);
  queue.push(token);
  timer ??= setTimeout(flush, BATCH_MS);
  return true;
}

function flush() {
  timer = null;
  const tokens = queue.splice(0, 20);
  if (queue.length > 0) timer = setTimeout(flush, BATCH_MS);
  if (tokens.length === 0) return;
  // keepalive: a view right before leaving the page still gets out
  void fetch(apiUrl("/api/fums/views"), {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokens }),
  }).catch(() => {
    // Lost views never get in the reader's way
  });
}

/** Report this chapter as shown while the component showing it is mounted
 * (and again if it shows another chapter). */
export function useFumsView(chapter: Pick<Chapter, "fumsToken"> | null | undefined) {
  const token = chapter?.fumsToken;
  useEffect(() => {
    if (token) noteView(token);
  }, [token]);
}

/** Tests only. */
export function resetFums() {
  lastReported.clear();
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
