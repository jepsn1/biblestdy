import type { Anchor, Note } from "@biblestdy/shared";
import { useEffect, useState } from "react";

/** Loads + mutates the current chapter's inline notes for the signed-in user. */
export function useNotes(translationId: string, book: string, chapter: number) {
  const [notes, setNotes] = useState<Note[]>([]);

  const key = `${translationId}/${book}/${chapter}`;
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });
    fetch(`/api/notes?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Note[]) => live && setNotes(data))
      .catch(() => live && setNotes([]));
    return () => {
      live = false;
    };
  }, [key, translationId, book, chapter]);

  async function add(anchor: Anchor, text: string) {
    const res = await fetch("/api/notes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...anchor, text }),
    });
    if (res.ok) {
      const created: Note = await res.json();
      setNotes((n) => [...n, created]);
    }
  }

  async function edit(id: string, text: string) {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const updated: Note = await res.json();
      setNotes((n) => n.map((x) => (x.id === updated.id ? updated : x)));
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setNotes((n) => n.filter((x) => x.id !== id));
  }

  return { notes, add, edit, remove };
}
