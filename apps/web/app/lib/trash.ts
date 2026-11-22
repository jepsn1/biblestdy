import type { TrashList } from "@biblestdy/shared";
import { api } from "./query";

/** GET /api/trash (#261): Recently deleted — the page, and the Notes
 * list's "Recently deleted (n)". */
export const trashQuery = { queryKey: ["trash"], queryFn: () => api<TrashList>("/api/trash") };

/** How many things can be restored. */
export function trashCount(list: TrashList | undefined): number {
  return list ? list.notes.length + list.highlights.length + list.annotations.length : 0;
}
