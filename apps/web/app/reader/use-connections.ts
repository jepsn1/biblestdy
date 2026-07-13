import type { ChapterConnections } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/query";

/** The connections panel's data for one chapter (issue #9). Note mutations
 * invalidate ["connections"] (see use-notes), so the panel tracks the graph. */
export function useConnections(
  translationId: string,
  book: string,
  chapter: number,
  enabled: boolean,
): ChapterConnections | null {
  const params = new URLSearchParams({
    translation: translationId,
    book,
    chapter: String(chapter),
  });
  const { data } = useQuery({
    queryKey: ["connections", translationId, book, chapter],
    queryFn: () => api<ChapterConnections>(`/api/connections?${params}`),
    enabled,
  });
  return data ?? null;
}
