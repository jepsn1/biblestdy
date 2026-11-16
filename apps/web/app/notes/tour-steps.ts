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
  /** The card points at the end of the text, not under the whole pane: a
   * tall writing area would leave it stranded at the bottom (#192). */
  atTextEnd?: boolean;
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
      atTextEnd: true,
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

type Box = { left: number; top: number; width: number; height: number };

/** How far the scrim's hole reaches past the target: round a control's
 * ring (2px, 2px out), a pane's edge (its ring is inside). */
export const holePad = (step: Pick<TourStep, "inset">) => (step.inset ? 0 : 6);

/**
 * The scrim (#192): the whole viewport, with a rounded hole round the
 * target — one SVG path, even-odd, so the hole lets clicks through to it.
 */
export function scrimPath(vw: number, vh: number, hole: Box | null, pad = 0, radius = 8): string {
  const page = `M0 0H${vw}V${vh}H0Z`;
  if (!hole) return page;
  const x = Math.max(0, hole.left - pad);
  const y = Math.max(0, hole.top - pad);
  const w = Math.min(vw, hole.left + hole.width + pad) - x;
  const h = Math.min(vh, hole.top + hole.height + pad) - y;
  if (w <= 0 || h <= 0) return page;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const n = (v: number) => Math.round(v * 10) / 10;
  return (
    `${page}M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/**
 * Where an `atTextEnd` card points (#192): just under the last line of the
 * text, kept inside the pane's visible part with room for the card (it
 * flips above when there's none).
 */
export function textEndPoint(pane: Box, lastLine: Box | null, room = 120): Box {
  if (!lastLine) return pane;
  const bottom = pane.top + pane.height;
  const y = Math.max(pane.top, Math.min(lastLine.top + lastLine.height, bottom - room));
  const left = Math.max(pane.left, Math.min(lastLine.left, pane.left + pane.width - 24));
  return { left, top: y, width: 24, height: 0 };
}
