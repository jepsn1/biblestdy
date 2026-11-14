import type { Anchor, Annotation, AnnotationMark, Chapter } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api } from "~/lib/query";
import { anchorQuote } from "./copy-attribution";
import { useQuoteBackfill } from "./quote-backfill";

/** All the user's annotations (palette search). Writes only touch chapter
 * caches, so it refetches each time it's enabled (palette opened). */
export function useAllAnnotationsQuery(enabled: boolean) {
  const { data: annotations = [] } = useQuery({
    queryKey: ["annotations", "all"],
    queryFn: () => api<Annotation[]>("/api/annotations").catch(() => []),
    enabled,
    staleTime: 0,
  });
  return annotations;
}

/** Loads + mutates the current chapter's inline annotations for the signed-in
 * user. Failed writes surface a toast with Retry; removal offers Undo (#64).
 * With the loaded `text`, new annotations carry their marked words (`quote`)
 * and older ones without get them backfilled. */
export function useAnnotations(translationId: string, book: string, chapter: number, text?: Chapter) {
  const qc = useQueryClient();
  const key = ["annotations", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: annotations = [], isFetched } = useQuery({
    queryKey: key,
    queryFn: () => api<Annotation[]>(`/api/annotations?${params}`).catch(() => []),
  });
  useQuoteBackfill("annotations", annotations, text, key);

  const replace = (updated: Annotation) =>
    qc.setQueryData<Annotation[]>(key, (n = []) => n.map((x) => (x.id === updated.id ? updated : x)));
  /** Put a (re)created annotation into the cache, replacing any same-id copy. */
  const put = (a: Annotation) =>
    qc.setQueryData<Annotation[]>(key, (n = []) => [...n.filter((x) => x.id !== a.id), a]);

  /** body null = a plain pen mark in `mark` style. */
  async function add(anchor: Anchor, body: string | null, mark?: AnnotationMark) {
    try {
      put(
        await api<Annotation>("/api/annotations", {
          method: "POST",
          body: JSON.stringify({ ...anchor, text: body, mark, quote: (text && anchorQuote(text, anchor)) || undefined }),
        }),
      );
    } catch (e) {
      notifyError(e, { retry: () => add(anchor, body, mark) });
    }
  }

  /** text null removes the margin text: the mark stays, plain. */
  async function edit(id: string, text: string | null) {
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
  async function place(
    id: string,
    patch: { offsetX?: number; offsetY?: number; width?: number; mark?: AnnotationMark | null },
  ) {
    qc.setQueryData<Annotation[]>(key, (n = []) =>
      n.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    await api(`/api/annotations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(
      (e: unknown) => notifyError(e, { retry: () => place(id, patch) }),
    );
  }

  return { annotations, loaded: isFetched, add, edit, remove, place, restore };
}
