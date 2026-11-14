import type { Anchor, Chapter } from "@biblestdy/shared";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "~/lib/query";
import { anchorQuote } from "./copy-attribution";

/** Rows already tried this session (success or not): once per row. */
const tried = new Set<string>();

/**
 * Lazy backfill of the marked words on rows made before quotes were stored:
 * when the chapter's rows are in and one has no quote, PATCH it quietly. One
 * request per row per session, failures silent; a success only patches the
 * cache in place (no refetch, no toast).
 */
export function useQuoteBackfill<T extends Anchor & { id: string; quote?: string | null }>(
  kind: "highlights" | "annotations",
  rows: T[],
  chapter: Chapter | undefined,
  key: QueryKey,
) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!chapter || chapter.verses.length === 0) return;
    for (const row of rows) {
      if (row.quote != null || row.translationId !== chapter.translationId) continue;
      if (row.book !== chapter.book || row.chapter !== chapter.chapter) continue;
      const id = `${kind}:${row.id}`;
      if (tried.has(id)) continue;
      tried.add(id);
      const quote = anchorQuote(chapter, row);
      if (!quote) continue;
      api(`/api/${kind}/${row.id}`, { method: "PATCH", body: JSON.stringify({ quote }) })
        .then(() => qc.setQueryData<T[]>(key, (list) => list?.map((x) => (x.id === row.id ? { ...x, quote } : x))))
        .catch(() => {});
    }
    // key is rebuilt each render; it follows chapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, rows, chapter, qc]);
}
