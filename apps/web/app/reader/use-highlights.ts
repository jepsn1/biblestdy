import type { Anchor, Highlight, HighlightColor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's highlights for the signed-in user. */
export function useHighlights(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["highlights", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: highlights = [], isFetched } = useQuery({
    queryKey: key,
    queryFn: () => api<Highlight[]>(`/api/highlights?${params}`).catch(() => []),
  });

  async function add(anchor: Anchor, color: HighlightColor) {
    const created = await api<Highlight>("/api/highlights", {
      method: "POST",
      body: JSON.stringify({ ...anchor, color }),
    }).catch(() => null);
    if (created) qc.setQueryData<Highlight[]>(key, (h = []) => [...h, created]);
  }

  async function remove(id: string) {
    await api(`/api/highlights/${id}`, { method: "DELETE" }).catch(() => null);
    qc.setQueryData<Highlight[]>(key, (h = []) => h.filter((x) => x.id !== id));
  }

  /** New colour, same span. Optimistic; a failed save restores the old one. */
  async function recolor(id: string, color: HighlightColor) {
    const before = qc.getQueryData<Highlight[]>(key);
    qc.setQueryData<Highlight[]>(key, (h = []) => h.map((x) => (x.id === id ? { ...x, color } : x)));
    const updated = await api<Highlight>(`/api/highlights/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ color }),
    }).catch(() => null);
    if (!updated) qc.setQueryData(key, before);
  }

  return { highlights, loaded: isFetched, add, remove, recolor };
}
