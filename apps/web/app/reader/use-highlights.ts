import type { Anchor, Highlight, HighlightColor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Loads + mutates the current chapter's highlights for the signed-in user. */
export function useHighlights(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["highlights", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const { data: highlights = [] } = useQuery({
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

  return { highlights, add, remove };
}
