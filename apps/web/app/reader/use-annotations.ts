import type { Anchor, Annotation } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's inline annotations for the signed-in
 * user. Failed writes surface a toast with Retry; removal offers Undo (#64). */
export function useAnnotations(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["annotations", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: annotations = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Annotation[]>(`/api/annotations?${params}`).catch(() => []),
  });

  const replace = (updated: Annotation) =>
    qc.setQueryData<Annotation[]>(key, (n = []) => n.map((x) => (x.id === updated.id ? updated : x)));
  /** Put a (re)created annotation into the cache, replacing any same-id copy. */
  const put = (a: Annotation) =>
    qc.setQueryData<Annotation[]>(key, (n = []) => [...n.filter((x) => x.id !== a.id), a]);

  async function add(anchor: Anchor, text: string) {
    try {
      put(
        await api<Annotation>("/api/annotations", {
          method: "POST",
          body: JSON.stringify({ ...anchor, text }),
        }),
      );
    } catch (e) {
      notifyError(e, { retry: () => add(anchor, text) });
    }
  }

  async function edit(id: string, text: string) {
    try {
      replace(
        await api<Annotation>(`/api/annotations/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ text }),
        }),
      );
    } catch (e) {
      notifyError(e, { retry: () => edit(id, text) });
    }
  }

  /** Brings a removed annotation back (Undo). Throws if the server can't. */
  async function restore(id: string) {
    put(await api<Annotation>(`/api/annotations/${id}/restore`, { method: "POST" }));
  }

  /** Removes at once (optimistic), then "Margin note removed · Undo". */
  async function remove(id: string) {
    const removed = qc.getQueryData<Annotation[]>(key)?.find((x) => x.id === id);
    await removeWithUndo({
      hide: () => qc.setQueryData<Annotation[]>(key, (n = []) => n.filter((x) => x.id !== id)),
      unhide: () => removed && put(removed),
      remove: () => api(`/api/annotations/${id}`, { method: "DELETE" }),
      restore: () => restore(id),
      message: i18n.t("toast.annotationRemoved"),
      retry: () => remove(id),
    });
  }

  /** Persist a dragged position (offset from the anchor's center) and/or a
   * resized width. Optimistic: the annotation was just placed there, so update
   * the cache immediately; a failed save says so (the box stays put locally). */
  async function place(id: string, patch: { offsetX?: number; offsetY?: number; width?: number }) {
    qc.setQueryData<Annotation[]>(key, (n = []) =>
      n.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    await api(`/api/annotations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(
      (e: unknown) => notifyError(e, { retry: () => place(id, patch) }),
    );
  }

  return { annotations, add, edit, remove, place, restore };
}
