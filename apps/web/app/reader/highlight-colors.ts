import type { HighlightColor } from "@biblestdy/shared";

/** Muted highlight backgrounds tuned for the dark parchment theme. */
export const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  gold: "oklch(0.83 0.10 85 / 0.28)",
  amber: "oklch(0.76 0.13 60 / 0.28)",
  green: "oklch(0.72 0.12 150 / 0.26)",
  blue: "oklch(0.70 0.11 240 / 0.32)",
  rose: "oklch(0.68 0.16 15 / 0.30)",
  purple: "oklch(0.66 0.16 300 / 0.32)",
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
