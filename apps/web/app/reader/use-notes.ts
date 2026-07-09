import type { Anchor, Note } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's inline notes for the signed-in user. */
export function useNotes(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["notes", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Note[]>(`/api/notes?${params}`).catch(() => []),
  });

  const replace = (updated: Note) =>
    qc.setQueryData<Note[]>(key, (n = []) => n.map((x) => (x.id === updated.id ? updated : x)));

  async function add(anchor: Anchor, text: string) {
    const created = await api<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ ...anchor, text }),
    }).catch(() => null);
    if (created) qc.setQueryData<Note[]>(key, (n = []) => [...n, created]);
  }

  async function edit(id: string, text: string) {
    const updated = await api<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (updated) replace(updated);
  }

  async function remove(id: string) {
    await api(`/api/notes/${id}`, { method: "DELETE" }).catch(() => null);
    qc.setQueryData<Note[]>(key, (n = []) => n.filter((x) => x.id !== id));
  }

  /** Persist a dragged position (offset from the anchor's center) and/or a
   * resized width. Optimistic: the note was just placed there, so update
   * the cache immediately. */
  async function place(id: string, patch: { offsetX?: number; offsetY?: number; width?: number }) {
    qc.setQueryData<Note[]>(key, (n = []) =>
      n.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    await api(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(
      () => null,
    );
  }

  return { notes, add, edit, remove, place };
}
