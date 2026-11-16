import { TOUR_KEYS, type ReplayDetail, REPLAY_TOURS, type TourId, type TourMemory } from "./tour-state";

/**
 * The notes tours' memory (#162), the part only the lazy chunks need (the
 * tours, Settings, the palette): writing it, the replay, one tour at a time.
 */

export function writeTour(id: TourId, value: TourMemory) {
  try {
    if (value) localStorage.setItem(TOUR_KEYS[id], value);
    else localStorage.removeItem(TOUR_KEYS[id]);
  } catch {
    // Storage blocked: nothing to keep
  }
}

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

/** Forgets both tours and asks whatever is on screen to start one. False:
 * nothing could start now (the caller says when it will). */
export function replayTours(): boolean {
  writeTour("note", null);
  writeTour("notes", null);
  const detail: ReplayDetail = { taken: false };
  window.dispatchEvent(new CustomEvent(REPLAY_TOURS, { detail }));
  return detail.taken;
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
