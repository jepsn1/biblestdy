import type { Anchor, Chapter, Highlight, HighlightColor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api } from "~/lib/query";
import { anchorQuote } from "./copy-attribution";
import { useQuoteBackfill } from "./quote-backfill";

/** All the user's highlights (palette search). Writes only touch chapter
 * caches, so it refetches each time it's enabled (palette opened). */
export function useAllHighlightsQuery(enabled: boolean) {
  const { data: highlights = [] } = useQuery({
    queryKey: ["highlights", "all"],
    queryFn: () => api<Highlight[]>("/api/highlights").catch(() => []),
    enabled,
    staleTime: 0,
  });
  return highlights;
}

/** Loads + mutates the current chapter's highlights for the signed-in user.
 * With the loaded `text`, new highlights carry their marked words (`quote`)
 * and older ones without get them backfilled.
 * Failed writes surface a toast with Retry; removal offers Undo (#64 — the
 * API soft-deletes, `restore` brings the row back). */
export function useHighlights(translationId: string, book: string, chapter: number, text?: Chapter) {
  const qc = useQueryClient();
  const key = ["highlights", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: highlights = [], isFetched } = useQuery({
    queryKey: key,
    queryFn: () => api<Highlight[]>(`/api/highlights?${params}`).catch(() => []),
  });
  useQuoteBackfill("highlights", highlights, text, key);

  /** Put a (re)created highlight into the cache, replacing any same-id copy. */
  function put(h: Highlight) {
    qc.setQueryData<Highlight[]>(key, (list = []) => [...list.filter((x) => x.id !== h.id), h]);
  }

  async function add(anchor: Anchor, color: HighlightColor) {
    try {
      put(
        await api<Highlight>("/api/highlights", {
          method: "POST",
          body: JSON.stringify({ ...anchor, color, quote: (text && anchorQuote(text, anchor)) || undefined }),
        }),
      );
    } catch (e) {
      notifyError(e, { retry: () => add(anchor, color) });
    }
  }

  /** Brings a removed highlight back (Undo). Throws if the server can't. */
  async function restore(id: string) {
    put(await api<Highlight>(`/api/highlights/${id}/restore`, { method: "POST" }));
  }

  /** Removes at once (optimistic), then "Highlight removed · Undo". A failed
   * delete puts it back and says so. */
  async function remove(id: string) {
    const removed = qc.getQueryData<Highlight[]>(key)?.find((x) => x.id === id);
    await removeWithUndo({
      hide: () => qc.setQueryData<Highlight[]>(key, (h = []) => h.filter((x) => x.id !== id)),
      unhide: () => removed && put(removed),
      remove: () => api(`/api/highlights/${id}`, { method: "DELETE" }),
      restore: () => restore(id),
      message: i18n.t("toast.highlightRemoved"),
      retry: () => remove(id),
    });
  }

  /** New colour, same span. Optimistic; a failed save restores the old one. */
  async function recolor(id: string, color: HighlightColor) {
    const before = qc.getQueryData<Highlight[]>(key);
    qc.setQueryData<Highlight[]>(key, (h = []) => h.map((x) => (x.id === id ? { ...x, color } : x)));
    try {
      await api<Highlight>(`/api/highlights/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ color }),
      });
    } catch (e) {
      qc.setQueryData(key, before);
      notifyError(e, { retry: () => recolor(id, color) });
    }
  }

  return { highlights, loaded: isFetched, add, remove, restore, recolor };
}
