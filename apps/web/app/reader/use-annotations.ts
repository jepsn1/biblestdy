import type { Anchor, Annotation } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's inline annotations for the signed-in user. */
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

  async function add(anchor: Anchor, text: string) {
    const created = await api<Annotation>("/api/annotations", {
      method: "POST",
      body: JSON.stringify({ ...anchor, text }),
    }).catch(() => null);
    if (created) qc.setQueryData<Annotation[]>(key, (n = []) => [...n, created]);
  }

  async function edit(id: string, text: string) {
    const updated = await api<Annotation>(`/api/annotations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (updated) replace(updated);
  }

  async function remove(id: string) {
    await api(`/api/annotations/${id}`, { method: "DELETE" }).catch(() => null);
    qc.setQueryData<Annotation[]>(key, (n = []) => n.filter((x) => x.id !== id));
  }

  /** Persist a dragged position (offset from the anchor's center) and/or a
   * resized width. Optimistic: the annotation was just placed there, so update
   * the cache immediately. */
  async function place(id: string, patch: { offsetX?: number; offsetY?: number; width?: number }) {
    qc.setQueryData<Annotation[]>(key, (n = []) =>
      n.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    await api(`/api/annotations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(
      () => null,
    );
  }

  return { annotations, add, edit, remove, place };
}
