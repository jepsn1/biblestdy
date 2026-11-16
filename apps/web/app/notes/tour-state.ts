/**
 * The notes tours' memory (#162), the part the first paint needs: two short
 * tours, one on the first note opened ("note"), one on the first visit to
 * the Notes page ("notes"). Kept on this device (localStorage; account sync
 * later), every access guarded — a private window or blocked storage just
 * means the tour may show again. The rest (writing it, replay, one tour at a
 * time) is in tour-memory.ts, with the lazy chunks.
 */

export type TourId = "note" | "notes";

/** null = not yet; "snoozed" = typed into once while it showed (note tour);
 * "seen" = done, skipped or closed. */
export type TourMemory = "snoozed" | "seen" | null;

export const TOUR_KEYS: Record<TourId, string> = { note: "tour.note", notes: "tour.notes" };

export function readTour(id: TourId): TourMemory {
  try {
    const v = localStorage.getItem(TOUR_KEYS[id]);
    return v === "seen" || v === "snoozed" ? v : null;
  } catch {
    return null;
  }
}

/** Still to show (never shown, or snoozed once). */
export const tourDue = (id: TourId) => readTour(id) !== "seen";

/** Event name: Settings or the palette asked for the tours again. A host
 * that can start one now (an open note, the Notes page) sets `taken`. */
export const REPLAY_TOURS = "biblestdy:replay-tours";
export type ReplayDetail = { taken: boolean };
