import type { Tag } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, notifyUndo } from "~/lib/notify";
import { api } from "~/lib/query";

/** Failed tag writes say so (#64) — toast, return null. */
function toastFail(e: unknown): null {
  notifyError(e);
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
      }).catch(toastFail),
    );
  }

  /** Untags, then "Tag removed · Undo" — undo re-adds it by name (the tag
   * itself may have been dropped as unused; re-adding recreates it). */
  async function remove(tag: Tag) {
    const updated = await api<Tag[]>(`/api/tags/note/${noteId}/${tag.id}`, {
      method: "DELETE",
    }).catch(toastFail);
    if (!updated) return;
    settle(updated);
    notifyUndo(i18n.t("toast.tagRemoved", { name: tag.name }), () => add(tag.name));
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
    }).catch(toastFail);
    settle();
  }

  /** Untags the passage, then "Tag removed · Undo" (re-adds by name). */
  async function remove(tag: Tag) {
    const params = new URLSearchParams({
      translation: translationId,
      book,
      chapter: String(chapter),
    });
    const updated = await api<Tag[]>(`/api/tags/passage/${tag.id}?${params}`, {
      method: "DELETE",
    }).catch(toastFail);
    settle();
    if (updated) {
      notifyUndo(i18n.t("toast.tagRemoved", { name: tag.name }), () => add(tag.name));
    }
  }

  return { add, remove };
}
