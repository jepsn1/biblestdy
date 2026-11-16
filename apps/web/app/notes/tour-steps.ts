import type { TourId } from "./tour-state";

/**
 * The notes tours' steps (#162) and the rules that walk them — pure, so
 * Vitest covers them; notes-tour.tsx does the DOM. Each step points at a
 * `data-tour` mark in the page and is skipped when that isn't on screen.
 * The button is taught; `@` only as its shortcut.
 */
export type TourStep = {
  id: string;
  /** i18n key of the step's one or two sentences. */
  text: string;
  /** CSS selector of the target (first match inside the tour's root). */
  target: string;
  side: "top" | "bottom";
  align: "start" | "center" | "end";
  /** A pane, not a control: its ring sits inside its edge (a pane's edge is
   * its scroll box's, which would clip a ring outside it). */
  inset?: boolean;
  /** Inserting a reference moves this step on (it never waits for one). */
  advancesOnInsert?: boolean;
};

export const TOUR_STEPS: Record<TourId, TourStep[]> = {
  // Started by the first note opened — reader panel or Notes page
  note: [
    {
      id: "body",
      text: "tour.note.body",
      // The rich editor's writing area, else its plain-text stand-in
      target: '[data-tour="note-editor"] [class*="_rootContentEditableWrapper_"], [data-tour="note-body"]',
      side: "bottom",
      align: "start",
      inset: true,
    },
    { id: "verse", text: "tour.note.verse", target: '[data-tour="note-verse"]', side: "bottom", align: "start", advancesOnInsert: true },
    { id: "refs", text: "tour.note.refs", target: '[data-tour="note-refs"]', side: "top", align: "start", inset: true },
  ],
  // Started by the first visit to the Notes page
  notes: [
    { id: "search", text: "tour.notes.search", target: '[data-tour="notes-search"]', side: "bottom", align: "start" },
    { id: "sort", text: "tour.notes.sort", target: '[data-tour="notes-sort"]', side: "bottom", align: "start" },
    { id: "new", text: "tour.notes.new", target: '[data-tour="notes-new"]', side: "bottom", align: "end" },
    { id: "mark", text: "tour.notes.mark", target: '[data-tour="notes-mark"]', side: "bottom", align: "start" },
  ],
};

/** Where the tour stands: the step on screen, and "n of total" as the
 * reader sees it (steps already shown + the ones still on screen). */
export type TourPlace = { index: number; n: number; total: number };

/**
 * The next step to show at or after `from`, given how many were shown so
 * far; steps whose target isn't on screen are passed over. null: nothing
 * left — the tour is done.
 */
export function nextPlace(
  steps: readonly TourStep[],
  from: number,
  shown: number,
  visible: (step: TourStep) => boolean,
): TourPlace | null {
  const ahead = steps.map((s, i) => i >= from && visible(s));
  const index = ahead.indexOf(true);
  if (index < 0) return null;
  const left = ahead.filter(Boolean).length;
  return { index, n: shown + 1, total: shown + left };
}

/** Inline references in the note grew since the step began: one was put
 * in, so a step that teaches inserting moves on. */
export function insertedSince(step: TourStep | undefined, refsAtStart: number, refsNow: number): boolean {
  return !!step?.advancesOnInsert && refsNow > refsAtStart;
}

/** Keys that don't write anything (moving, closing, shortcuts). */
export function isTypingKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  return e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete";
}
