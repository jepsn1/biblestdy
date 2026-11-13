import type { Anchor, Highlight, HighlightColor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's highlights for the signed-in user.
 * Failed writes surface a toast with Retry; removal offers Undo (#64 — the
 * API soft-deletes, `restore` brings the row back). */
export function useHighlights(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["highlights", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: highlights = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Highlight[]>(`/api/highlights?${params}`).catch(() => []),
  });

  /** Put a (re)created highlight into the cache, replacing any same-id copy. */
  function put(h: Highlight) {
    qc.setQueryData<Highlight[]>(key, (list = []) => [...list.filter((x) => x.id !== h.id), h]);
  }

  async function add(anchor: Anchor, color: HighlightColor) {
    try {
      put(
        await api<Highlight>("/api/highlights", {
          method: "POST",
          body: JSON.stringify({ ...anchor, color }),
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

  return { highlights, add, remove, restore };
}
