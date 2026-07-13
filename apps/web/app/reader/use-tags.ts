import type { Tag } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

function logFail(e: unknown): null {
  console.error("[tags]", e);
  return null;
}

/** One note's tags + add/remove (issue #10). The connections panel is a view
 * over the same graph — its cache is dropped on every tag mutation. */
export function useNoteTags(noteId: string) {
  const qc = useQueryClient();
  const key = ["tags", "note", noteId];

  const { data: tags = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Tag[]>(`/api/tags/note/${noteId}`).catch(() => []),
  });

  function settle(updated: Tag[] | null) {
    if (!updated) return;
    qc.setQueryData<Tag[]>(key, updated);
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  async function add(name: string) {
    settle(
      await api<Tag[]>(`/api/tags/note/${noteId}`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }).catch(logFail),
    );
  }

  async function remove(tagId: string) {
    settle(
      await api<Tag[]>(`/api/tags/note/${noteId}/${tagId}`, {
        method: "DELETE",
      }).catch(logFail),
    );
  }

  return { tags, add, remove };
}

/** Tag/untag the current passage (chapter). The panel reads topics from the
 * connections query, so mutations just drop that cache. */
export function usePassageTags(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const passage = { translationId, book, chapter };

  function settle() {
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  async function add(name: string) {
    await api<Tag[]>("/api/tags/passage", {
      method: "POST",
      body: JSON.stringify({ ...passage, name }),
    }).catch(logFail);
    settle();
  }

  async function remove(tagId: string) {
    const params = new URLSearchParams({
      translation: translationId,
      book,
      chapter: String(chapter),
    });
    await api<Tag[]>(`/api/tags/passage/${tagId}?${params}`, {
      method: "DELETE",
    }).catch(logFail);
    settle();
  }

  return { add, remove };
}
