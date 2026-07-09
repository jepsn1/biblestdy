import type { Anchor, Note } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's notes (markdown documents) for the
 * signed-in user. */
export function useNotes(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["notes", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Note[]>(`/api/notes?${params}`).catch(() => []),
  });

  /** Creates an empty document on the anchor; returns it so the caller can
   * open the editor. */
  async function add(anchor: Anchor): Promise<Note | null> {
    const created = await api<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(() => null);
    if (created) qc.setQueryData<Note[]>(key, (n = []) => [...n, created]);
    return created;
  }

  async function edit(id: string, patch: { title?: string; body?: string }) {
    const updated = await api<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (updated)
      qc.setQueryData<Note[]>(key, (n = []) =>
        n.map((x) => (x.id === updated.id ? updated : x)),
      );
  }

  async function remove(id: string) {
    await api(`/api/notes/${id}`, { method: "DELETE" }).catch(() => null);
    qc.setQueryData<Note[]>(key, (n = []) => n.filter((x) => x.id !== id));
  }

  return { notes, add, edit, remove };
}
