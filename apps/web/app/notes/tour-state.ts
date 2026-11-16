/**
 * The notes tours' memory (#162): two short tours, one on the first note
 * opened ("note"), one on the first visit to the Notes page ("notes"). What
 * each has done is kept on this device (localStorage; account sync later),
 * every access guarded — a private window or blocked storage just means the
 * tour may show again. Tiny and in the first paint: the tours themselves are
 * a lazy chunk (notes-tour.tsx), fetched only when one will show.
 */

export type TourId = "note" | "notes";

/** null = not yet; "snoozed" = typed into once while it showed (note tour);
 * "seen" = done, skipped or closed. */
export type TourMemory = "snoozed" | "seen" | null;

const KEYS: Record<TourId, string> = { note: "tour.note", notes: "tour.notes" };

export function readTour(id: TourId): TourMemory {
  try {
    const v = localStorage.getItem(KEYS[id]);
    return v === "seen" || v === "snoozed" ? v : null;
  } catch {
    return null;
  }
}

export function writeTour(id: TourId, value: TourMemory) {
  try {
    if (value) localStorage.setItem(KEYS[id], value);
    else localStorage.removeItem(KEYS[id]);
  } catch {
    // Storage blocked: nothing to keep
  }
}

/** Still to show (never shown, or snoozed once). */
export const tourDue = (id: TourId) => readTour(id) !== "seen";

/** Typing in the note while its tour shows (Kasper): it goes, and comes
 * back on the next note open — once. */
export function afterTyping(memory: TourMemory): TourMemory {
  return memory === null ? "snoozed" : "seen";
}

/** "Spring over" on either tour turns off both. */
export function skipAllTours() {
  writeTour("note", "seen");
  writeTour("notes", "seen");
}

/** Event name: Settings or the palette asked for the tours again. */
export const REPLAY_TOURS = "biblestdy:replay-tours";

/** Hosts on screen that can start a tour right now (an open note, the
 * Notes page) — they answer the replay. */
let hosts = 0;
export function tourHostMounted(): () => void {
  hosts++;
  return () => {
    hosts--;
  };
}

/** Forgets both tours and asks whatever is on screen to start one. False:
 * nothing could start now (the caller says when it will). */
export function replayTours(): boolean {
  writeTour("note", null);
  writeTour("notes", null);
  window.dispatchEvent(new Event(REPLAY_TOURS));
  return hosts > 0;
}

/** One tour at a time: the Notes page's and a note's never stack. */
let active: TourId | null = null;
export function claimTour(id: TourId): boolean {
  if (active && active !== id) return false;
  active = id;
  return true;
}
export function releaseTour(id: TourId) {
  if (active === id) active = null;
}
