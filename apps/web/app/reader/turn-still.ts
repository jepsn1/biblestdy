/**
 * What moves on a page turn: ONLY the page — the words and the ink on them.
 *
 * In a chapter the text column slides (its translateX) with its word ink;
 * crossing into another chapter, the whole paged sheet is one view-transition
 * layer that slides (app.css, "Chapter turn"). The sheet also holds the
 * reader's chrome — the chapter strip over the text, the running foot under
 * it, the marks-load line — and those must stay put, as on a printed page.
 * Each lifts itself out of the sheet's snapshot as its own still layer
 * (`turnStill`): a view-transition name, unanimated, the new state shown at
 * once. Anything you add to the paged sheet that is not the page itself
 * takes a `turnStill` name here, and app.css lists it (turn-still.test.ts
 * fails until both agree). Names are unique: a duplicate cancels the slide.
 */
export const TURN_STILL = ["strip", "foot", "error-flow", "error-foot"] as const;
export type TurnStill = (typeof TURN_STILL)[number];

/** Spread on a still layer's element: `<nav {...turnStill("strip")}>`. */
export function turnStill(name: TurnStill) {
  return { "data-turn-still": name } as const;
}

/** Its view-transition name while a chapter turn runs (app.css). */
export function stillLayerName(name: TurnStill): string {
  return `turn-still-${name}`;
}
