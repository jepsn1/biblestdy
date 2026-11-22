import type { Anchor, NewNote, Note } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { pruneDrafts } from "~/lib/note-drafts";
import i18n from "~/lib/i18n";
import { notifyError, removeWithUndo } from "~/lib/notify";
import { api, updateList } from "~/lib/query";
import { noteTouchesChapter } from "./note-marks";

export type EditOptions = {
  /** The page is being hidden (screen off, app switch, #261): the request
   * must outlive it. */
  keepalive?: boolean;
};

/** keepalive caps the body at 64 KB (fetch spec): a longer note goes as a
 * plain request — its words are on the device (note-drafts) meanwhile. */
export const KEEPALIVE_MAX = 60_000;

/** The PATCH request for a note save. */
export function patchInit(patch: { title?: string; body?: string }, opts?: EditOptions): RequestInit {
  const body = JSON.stringify(patch);
  return { method: "PATCH", body, ...(opts?.keepalive && body.length < KEEPALIVE_MAX && { keepalive: true }) };
}

/** Notes made in this visit and not yet written in (#261): one closed
 * while still blank (no title, no text) was abandoned — a "New note" tapped
 * instead of "Add to a note…" — and is discarded, never left behind as an
 * empty note. */
export const freshNotes = new Set<string>();

/** Silently removes an abandoned blank note (no Undo: nothing to lose).
 * Soft delete, never listed under Recently deleted (blank). */
async function discardNote(qc: ReturnType<typeof useQueryClient>, id: string) {
  freshNotes.delete(id);
  qc.setQueriesData<Note[]>({ queryKey: ["notes"] }, (list) => list?.filter((n) => n.id !== id));
  try {
    await api(`/api/notes/${id}`, { method: "DELETE" });
  } catch (e) {
    console.error("[discard]", e); // an empty note stays: harmless
  }
  void qc.invalidateQueries({ queryKey: ["notes"] });
  void qc.invalidateQueries({ queryKey: ["connections"] });
}

/** Mutations must not fail silently (#64) — inline notice, return null, let callers
 * no-op. */
function failed(e: unknown): null {
  notifyError(e);
  return null;
}

/** ALL the user's notes — the attach-an-existing-note picker. */
export function useAllNotes(enabled: boolean) {
  return useAllNotesQuery(enabled).notes;
}

/** All notes + whether they have loaded (first-use hint, #63) or failed
 * (the Notes page says so rather than showing an empty library). */
export function useAllNotesQuery(enabled: boolean) {
  const { data: notes = [], isFetched, isFetching, isError, isSuccess, refetch } = useQuery({
    queryKey: ["notes", "all"],
    queryFn: () => api<Note[]>("/api/notes"),
    enabled,
  });
  // Every note there is: drafts of any other are orphans (deleted elsewhere)
  useEffect(() => {
    if (isSuccess) pruneDrafts(new Set(notes.map((n) => n.id)));
  }, [isSuccess, notes]);
  return { notes, loaded: isFetched, fetching: isFetching, failed: isError, retry: refetch };
}

/** One chapter's notes — shared with the neighbour prefetch. A failed load
 * stays an error (never "no notes"): the reader says so. */
export function notesQuery(translationId: string, book: string, chapter: number) {
  const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });
  return {
    queryKey: ["notes", translationId, book, chapter],
    queryFn: () => api<Note[]>(`/api/notes?${params}`),
  };
}

/** Loads + mutates the current chapter's notes (markdown documents) for the
 * signed-in user. A failed load is `failed`, `retry` loads again. */
export function useNotes(translationId: string, book: string, chapter: number) {
  const qc = useQueryClient();
  const query = notesQuery(translationId, book, chapter);
  const key = query.queryKey;

  // Listed here in every translation: an anchor here or an inline ref (#159)
  const inChapter = (n: Note) => noteTouchesChapter(n, book, chapter);

  const { data: notes = [], isError, refetch } = useQuery(query);

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
    }).catch(failed);
    if (created) {
      freshNotes.add(created.id);
      updateList<Note>(qc, key, (n) => [...n, created]);
      invalidateAll();
    }
    return created;
  }

  /** Saves title/body. Resolves to the server's copy — the note panel's
   * save state comes from this — and REJECTS on failure, so the panel can
   * show "Not saved · Retry" (#64). */
  async function edit(id: string, patch: { title?: string; body?: string }, opts?: EditOptions): Promise<Note> {
    const updated = await api<Note>(`/api/notes/${id}`, patchInit(patch, opts));
    updateList<Note>(qc, key, (n) => n.map((x) => (x.id === updated.id ? updated : x)));
    invalidateAll();
    return updated;
  }

  /** Brings a deleted note back with its anchors and tags (Undo). Throws if
   * the server can't. */
  async function restore(id: string): Promise<Note> {
    const note = await api<Note>(`/api/notes/${id}/restore`, { method: "POST" });
    if (inChapter(note)) {
      updateList<Note>(qc, key, (n) => [...n.filter((x) => x.id !== id), note]);
    }
    invalidateAll();
    return note;
  }

  /** Deletes at once (optimistic), then "Note deleted · Undo" (#64: the API
   * soft-deletes). A failed delete puts the note back and says so. */
  async function remove(id: string) {
    const removed = qc.getQueryData<Note[]>(key)?.find((x) => x.id === id);
    const deleted = await removeWithUndo({
      hide: () => updateList<Note>(qc, key, (n) => n.filter((x) => x.id !== id)),
      unhide: () => removed && updateList<Note>(qc, key, (n) => [...n, removed]),
      remove: () => api(`/api/notes/${id}`, { method: "DELETE" }),
      restore: () => restore(id),
      message: i18n.t("notice.noteDeleted"),
      retry: () => remove(id),
    });
    if (deleted) invalidateAll();
  }

  /** Anchors an existing note (possibly from another chapter) to a span here. */
  async function attach(noteId: string, anchor: Anchor): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors`, {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(failed);
    if (updated) {
      updateList<Note>(qc, key, (n) =>
        n.some((x) => x.id === updated.id)
          ? n.map((x) => (x.id === updated.id ? updated : x))
          : [...n, updated],
      );
      invalidateAll();
    }
    return updated;
  }

  /** Removes one anchor; the note leaves this chapter's list when nothing
   * else ties it here (an anchor in any translation, or an inline ref). The
   * API refuses to remove a note's last anchor. Resolves to the updated
   * note, null when it failed. */
  async function detach(noteId: string, anchorId: string): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors/${anchorId}`, {
      method: "DELETE",
    }).catch(failed);
    if (updated) {
      updateList<Note>(qc, key, (n) =>
        n
          .map((x) => (x.id === updated.id ? updated : x))
          .filter((x) => x.id !== updated.id || inChapter(updated)),
      );
      invalidateAll();
    }
    return updated;
  }

  const discard = (id: string) => discardNote(qc, id);
  return { notes, failed: isError, retry: refetch, add, edit, remove, restore, attach, detach, discard };
}

/**
 * Note mutations outside one chapter — the Notes page and its editor. Write
 * through to the all-notes list (instant), then refetch every note view
 * (chapters, connections) since a note reaches into each chapter it cites.
 */
export function useNoteActions() {
  const qc = useQueryClient();
  const allKey = ["notes", "all"];

  function put(note: Note) {
    updateList<Note>(qc, allKey, (n) =>
      n.some((x) => x.id === note.id)
        ? n.map((x) => (x.id === note.id ? { ...note, tags: note.tags ?? x.tags } : x))
        : [note, ...n],
    );
  }
  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  /** A note with no passage yet (or on `anchor`); null after a notice. */
  async function create(content: NewNote = {}): Promise<Note | null> {
    const created = await api<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(content),
    }).catch(failed);
    if (created) {
      if (!created.title && !created.body) freshNotes.add(created.id);
      put({ ...created, tags: [] });
      invalidateAll();
    }
    return created;
  }

  /** Saves title/body; rejects on failure (the editor's save state). */
  async function edit(id: string, patch: { title?: string; body?: string }, opts?: EditOptions): Promise<Note> {
    const updated = await api<Note>(`/api/notes/${id}`, patchInit(patch, opts));
    put(updated);
    invalidateAll();
    return updated;
  }

  async function restore(id: string): Promise<Note> {
    const note = await api<Note>(`/api/notes/${id}/restore`, { method: "POST" });
    invalidateAll();
    return note;
  }

  /** Deletes at once, then "Note deleted · Undo" (soft delete, #64) — in
   * the list row's place when `inPlace` takes the undo (#257). */
  async function remove(id: string, inPlace?: (undo: () => Promise<unknown>) => void) {
    const removed = qc.getQueryData<Note[]>(allKey)?.find((x) => x.id === id);
    const deleted = await removeWithUndo({
      hide: () => updateList<Note>(qc, allKey, (n) => n.filter((x) => x.id !== id)),
      unhide: () => removed && updateList<Note>(qc, allKey, (n) => [removed, ...n]),
      remove: () => api(`/api/notes/${id}`, { method: "DELETE" }),
      restore: () => restore(id),
      message: i18n.t("notice.noteDeleted"),
      retry: () => remove(id, inPlace),
      inPlace,
    });
    if (deleted) invalidateAll();
  }

  /** References the note to one more passage. */
  async function attach(noteId: string, anchor: Anchor): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors`, {
      method: "POST",
      body: JSON.stringify(anchor),
    }).catch(failed);
    if (updated) {
      put(updated);
      invalidateAll();
    }
    return updated;
  }

  /** Drops one reference — the last one too (the note stays, unlinked).
   * Resolves to the updated note, null when it failed (its notice said so). */
  async function detach(noteId: string, anchorId: string): Promise<Note | null> {
    const updated = await api<Note>(`/api/notes/${noteId}/anchors/${anchorId}`, {
      method: "DELETE",
    }).catch(failed);
    if (updated) {
      put(updated);
      invalidateAll();
    }
    return updated;
  }

  const discard = (id: string) => discardNote(qc, id);
  return { create, edit, remove, restore, attach, detach, discard };
}
