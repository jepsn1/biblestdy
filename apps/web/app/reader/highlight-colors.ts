import type { HighlightColor } from "@biblestdy/shared";

/** Pen ink — everything the "pen" draws: scribble loops, leader lines, margin
 * handwriting. A different material from the gold UI accent and the marker
 * washes (like blue pen over orange highlighter on paper). Ballpoint blue;
 * per-theme values live in app.css (dark on paper, lightened on charcoal). */
export const NOTE_INK = "var(--note-ink)";
/** Margin note handwriting, active / at rest. */
export const NOTE_INK_TEXT_ACTIVE = "var(--note-ink-text-active)";
export const NOTE_INK_TEXT = "var(--note-ink-text)";
/** Soft wash behind the circled words while their note is active. */
export const NOTE_INK_WASH = "var(--note-ink-wash)";
/** A reference selected in the note panel: its mark pulses in warm amber,
 * unmistakably not the ballpoint blue. */
export const NOTE_INK_SELECTED = "var(--note-ink-selected)";
export const NOTE_INK_SELECTED_WASH = "var(--note-ink-selected-wash)";

/** Marker washes — themed in app.css (saturated on paper, muted on charcoal). */
export const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  gold: "var(--hl-gold)",
  amber: "var(--hl-amber)",
  green: "var(--hl-green)",
  blue: "var(--hl-blue)",
  rose: "var(--hl-rose)",
  purple: "var(--hl-purple)",
};

/** More saturated dot for the color picker. */
export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  gold: "oklch(0.83 0.13 85)",
  amber: "oklch(0.78 0.16 60)",
  green: "oklch(0.72 0.15 150)",
  blue: "oklch(0.70 0.14 240)",
  rose: "oklch(0.68 0.19 15)",
  purple: "oklch(0.66 0.19 300)",
};
