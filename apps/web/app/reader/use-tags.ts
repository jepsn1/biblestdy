import type { Note, Tag } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "~/lib/notify";
import { api } from "~/lib/query";

/** Failed tag writes say so (#64) — inline notice, return null. */
function failed(e: unknown): null {
  notifyError(e, { place: "note" });
  return null;
}

/** One note's tags + add/remove (issue #10). The connections panel is a view
 * over the same graph — its cache is dropped on every tag mutation. A failed
 * load is `failed` (never "no topics"), `retry` loads again. */
export function useNoteTags(noteId: string) {
  const qc = useQueryClient();
  const key = ["tags", "note", noteId];

  const { data: tags = [], isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api<Tag[]>(`/api/tags/note/${noteId}`),
  });

  function settle(updated: Tag[] | null) {
    if (!updated) return;
    qc.setQueryData<Tag[]>(key, updated);
    // The Notes list shows and filters by topics
    qc.setQueryData<Note[]>(["notes", "all"], (n) => n?.map((x) => (x.id === noteId ? { ...x, tags: updated } : x)));
    void qc.invalidateQueries({ queryKey: ["connections"] });
    void qc.invalidateQueries({ queryKey: ["topic"] });
  }

  async function add(name: string) {
    settle(
      await api<Tag[]>(`/api/tags/note/${noteId}`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }).catch(failed),
    );
  }

  /** Untags; true when done. The chip itself then says "Removed · Undo"
   * (tag-chips.tsx, #257) — undo re-adds it by name (the tag itself may have
   * been dropped as unused; re-adding recreates it). */
  async function remove(tag: Tag): Promise<boolean> {
    const updated = await api<Tag[]>(`/api/tags/note/${noteId}/${tag.id}`, {
      method: "DELETE",
    }).catch(failed);
    if (!updated) return false;
    settle(updated);
    return true;
  }

  return { tags, failed: isError, retry: refetch, add, remove };
}
