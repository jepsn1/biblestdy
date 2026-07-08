import type { Anchor, Highlight } from "@biblestdy/shared";
import { useEffect, useState } from "react";

/** Loads + mutates the current chapter's highlights for the signed-in user. */
export function useHighlights(translationId: string, book: string, chapter: number) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const key = `${translationId}/${book}/${chapter}`;
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ translation: translationId, book, chapter: String(chapter) });
    fetch(`/api/highlights?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Highlight[]) => {
        if (live) setHighlights(data);
      })
      .catch(() => {
        if (live) setHighlights([]);
      });
    return () => {
      live = false;
    };
  }, [key, translationId, book, chapter]);

  async function add(anchor: Anchor) {
    const res = await fetch("/api/highlights", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(anchor),
    });
    if (res.ok) {
      const created: Highlight = await res.json();
      setHighlights((h) => [...h, created]);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/highlights/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setHighlights((h) => h.filter((x) => x.id !== id));
  }

  return { highlights, add, remove };
}
