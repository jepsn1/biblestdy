import type { Anchor, FullNote } from "@biblestdy/shared";
import { useEffect, useState } from "react";

/** Loads + mutates the current chapter's full notes (markdown docs) for the
 * signed-in user. */
export function useFullNotes(translationId: string, book: string, chapter: number) {
  const [fullNotes, setFullNotes] = useState<FullNote[]>([]);

  const key = `${translationId}/${book}/${chapter}`;
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });
    fetch(`/api/full-notes?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: FullNote[]) => live && setFullNotes(data))
      .catch(() => live && setFullNotes([]));
    return () => {
      live = false;
    };
  }, [key, translationId, book, chapter]);

  /** Creates an empty document on the anchor; returns it so the caller can
   * open the editor. */
  async function add(anchor: Anchor): Promise<FullNote | null> {
    const res = await fetch("/api/full-notes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(anchor),
    });
    if (!res.ok) return null;
    const created: FullNote = await res.json();
    setFullNotes((n) => [...n, created]);
    return created;
  }

  async function edit(id: string, patch: { title?: string; body?: string }) {
    const res = await fetch(`/api/full-notes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: FullNote = await res.json();
      setFullNotes((n) => n.map((x) => (x.id === updated.id ? updated : x)));
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/full-notes/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setFullNotes((n) => n.filter((x) => x.id !== id));
  }

  return { fullNotes, add, edit, remove };
}
