import type { Anchor, Note, NoteAnchor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api } from "~/lib/query";

/** Mutations must not fail silently (#64) — toast, return null, let callers
 * no-op. */
function toastFail(e: unknown): null {
  notifyError(e);
  return null;
}

/** One drawn mark: a single anchor of a note within the current chapter. */
export type NoteMark = NoteAnchor & { noteId: string; title: string };

/** Per-anchor marks of the chapter's notes — a note anchored twice in a
 * chapter draws two marks, each opening the same document. */
export function noteMarksInChapter(
  notes: Note[],
  translationId: string,
  book: string,
  chapter: number,
): NoteMark[] {
  return notes.flatMap((n) =>
    n.anchors
      .filter((a) => a.translationId === translationId && a.book === book && a.chapter === chapter)
      .map((a) => ({ ...a, noteId: n.id, title: n.title })),
  );
}

/** ALL the user's notes — the attach-an-existing-note picker. */
export function useAllNotes(enabled: boolean) {
  return useAllNotesQuery(enabled).notes;
}

/** All notes + whether they have loaded (first-use hint, #63). */
export function useAllNotesQuery(enabled: boolean) {
  const { data: notes = [], isFetched } = useQuery({
    queryKey: ["notes", "all"],
    queryFn: () => api<Note[]>("/api/notes").catch(() => []),
    enabled,
  });
  return { notes, loaded: isFetched };
}

/** Loads + mutates the current chapter's notes (markdown documents) for the
 * signed-in user. */
export function useNotes(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const key = ["notes", translationId, book, chapter];
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });

  const inChapter = (n: Note) =>
    n.anchors.some(
      (a) => a.translationId === translationId && a.book === book && a.chapter === chapter,
    );

  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Note[]>(`/api/notes?${params}`).catch(() => []),
  });

  /** A note reaches into every chapter it anchors in — after any mutation,
   * refetch all note queries (the setQueryData above keeps this chapter
   * instant; other chapters and the all-notes picker catch up here). */
  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ["notes"] });
    // The connections panel is a view over the same graph
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  /** Creates an empty document on the anchor; returns it so the caller can
   * open the editor. */
  async function add(anchor: Anchor): Promise<Note | null> {
    const created = await api<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(toastFail);
    if (created) {
      qc.setQueryData<Note[]>(key, (n = []) => [...n, created]);
      invalidateAll();
    }
    return created;
  }

  /** Saves title/body. Resolves to the server's copy — the note panel's
   * save state comes from this — and REJECTS on failure, so the panel can
   * show "Not saved · Retry" (#64). */
  async function edit(id: string, patch: { title?: string; body?: string }): Promise<Note> {
    const updated = await api<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    qc.setQueryData<Note[]>(key, (n = []) => n.map((x) => (x.id === updated.id ? updated : x)));
    invalidateAll();
    return updated;
  }

  /** Brings a deleted note back with its anchors and tags (Undo). Throws if
   * the server can't. */
  async function restore(id: string): Promise<Note> {
    const note = await api<Note>(`/api/notes/${id}/restore`, { method: "POST" });
    if (inChapter(note)) {
      qc.setQueryData<Note[]>(key, (n = []) => [...n.filter((x) => x.id !== id), note]);
    }
    invalidateAll();
    return note;
  }

  /** Deletes at once (optimistic), then "Note deleted · Undo" (#64: the API
   * soft-deletes). A failed delete puts the note back and says so. */
  async function remove(id: string) {
    const removed = qc.getQueryData<Note[]>(key)?.find((x) => x.id === id);
    const deleted = await removeWithUndo({
      hide: () => qc.setQueryData<Note[]>(key, (n = []) => n.filter((x) => x.id !== id)),
      unhide: () => removed && qc.setQueryData<Note[]>(key, (n = []) => [...n, removed]),
      remove: () => api(`/api/notes/${id}`, { method: "DELETE" }),
      restore: () => restore(id),
      message: i18n.t("toast.noteDeleted"),
      retry: () => remove(id),
    });
    if (deleted) invalidateAll();
  }

  /** Anchors an existing note (possibly from another chapter) to a span here. */
  async function attach(noteId: string, anchor: Anchor): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors`, {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(toastFail);
    if (updated) {
      qc.setQueryData<Note[]>(key, (n = []) =>
        n.some((x) => x.id === updated.id)
          ? n.map((x) => (x.id === updated.id ? updated : x))
          : [...n, updated],
      );
      invalidateAll();
    }
    return updated;
  }

  /** Removes one anchor; the note leaves this chapter's list when it was its
   * last anchor here. The API refuses to remove a note's last anchor. */
  async function detach(noteId: string, anchorId: string) {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors/${anchorId}`, {
      method: "DELETE",
    }).catch(toastFail);
    if (updated) {
      qc.setQueryData<Note[]>(key, (n = []) =>
        n
          .map((x) => (x.id === updated.id ? updated : x))
          .filter((x) => x.id !== updated.id || inChapter(updated)),
      );
      invalidateAll();
    }
  }

  return { notes, add, edit, remove, restore, attach, detach };
}

/** Per-verse counts of notes anchored here in OTHER translations (#11) —
 * bridges versions until shadow notes. Key sits under ["notes"] so note
 * mutations invalidate it too. */
export function useOtherVersionCounts(
  translationId: string,
  book: string,
  chapter: number,
): Map<number, number> {
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });
  const { data = [] } = useQuery({
    queryKey: ["notes", "other-versions", translationId, book, chapter],
    queryFn: () =>
      api<{ verse: number; count: number }[]>(`/api/notes/other-versions?${params}`).catch(
        () => [],
      ),
  });
  return new Map(data.map((c) => [c.verse, c.count]));
}
