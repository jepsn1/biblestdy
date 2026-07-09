import type { Anchor, FullNote } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's full notes (markdown docs) for the
 * signed-in user. */
export function useFullNotes(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["full-notes", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: fullNotes = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<FullNote[]>(`/api/full-notes?${params}`).catch(() => []),
  });

  /** Creates an empty document on the anchor; returns it so the caller can
   * open the editor. */
  async function add(anchor: Anchor): Promise<FullNote | null> {
    const created = await api<FullNote>("/api/full-notes", {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(() => null);
    if (created) qc.setQueryData<FullNote[]>(key, (n = []) => [...n, created]);
    return created;
  }

  async function edit(id: string, patch: { title?: string; body?: string }) {
    const updated = await api<FullNote>(`/api/full-notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (updated)
      qc.setQueryData<FullNote[]>(key, (n = []) =>
        n.map((x) => (x.id === updated.id ? updated : x)),
      );
  }

  async function remove(id: string) {
    await api(`/api/full-notes/${id}`, { method: "DELETE" }).catch(() => null);
    qc.setQueryData<FullNote[]>(key, (n = []) => n.filter((x) => x.id !== id));
  }

  return { fullNotes, add, edit, remove };
}
