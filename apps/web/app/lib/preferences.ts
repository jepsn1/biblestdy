import type { Preferences, PreferencesPatch } from "@biblestdy/shared";
import { api } from "./query";

/**
 * Account preferences (/api/preferences): reader style (#45) + text size
 * (#61). Fetched once per user per page load and shared by both loaders, so
 * a route that applies both still makes one request.
 */
let cache: { userId: string; prefs: Promise<Preferences | null> } | undefined;

/** The account's preferences; null on a network/server error (callers keep
 * whatever is applied locally). */
export function loadPreferences(userId: string): Promise<Preferences | null> {
  if (cache?.userId !== userId) {
    const prefs = api<Preferences>("/api/preferences").catch(() => null);
    cache = { userId, prefs };
    // A failed fetch is retried on the next loader call
    void prefs.then((p) => {
      if (p === null && cache?.prefs === prefs) cache = undefined;
    });
  }
  return cache.prefs;
}

/** Save a change: the cached copy updates at once, then PATCH. */
export async function savePreferences(patch: PreferencesPatch): Promise<void> {
  if (cache) {
    const prev = cache.prefs;
    cache = { ...cache, prefs: prev.then((p) => (p ? { ...p, ...patch } : p)) };
  }
  await api<Preferences>("/api/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
