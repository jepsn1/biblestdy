import type { Anchor, Note, NoteAnchor } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** Mutations must not fail silently — log, return null, let callers no-op. */
function logFail(e: unknown): null {
  console.error("[notes]", e);
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
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", "all"],
    queryFn: () => api<Note[]>("/api/notes").catch(() => []),
    enabled,
  });
  return notes;
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
  }

  /** Creates an empty document on the anchor; returns it so the caller can
   * open the editor. */
  async function add(anchor: Anchor): Promise<Note | null> {
    const created = await api<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(logFail);
    if (created) {
      qc.setQueryData<Note[]>(key, (n = []) => [...n, created]);
      invalidateAll();
    }
    return created;
  }

  async function edit(id: string, patch: { title?: string; body?: string }) {
    const updated = await api<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch(logFail);
    if (updated) {
      qc.setQueryData<Note[]>(key, (n = []) =>
        n.map((x) => (x.id === updated.id ? updated : x)),
      );
      invalidateAll();
    }
  }

  async function remove(id: string) {
    await api(`/api/notes/${id}`, { method: "DELETE" }).catch(logFail);
    qc.setQueryData<Note[]>(key, (n = []) => n.filter((x) => x.id !== id));
    invalidateAll();
  }

  /** Anchors an existing note (possibly from another chapter) to a span here. */
  async function attach(noteId: string, anchor: Anchor): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors`, {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(logFail);
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
    }).catch(logFail);
    if (updated) {
      qc.setQueryData<Note[]>(key, (n = []) =>
        n
          .map((x) => (x.id === updated.id ? updated : x))
          .filter((x) => x.id !== updated.id || inChapter(updated)),
      );
      invalidateAll();
    }
  }

  return { notes, add, edit, remove, attach, detach };
}
