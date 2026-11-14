import { HIGHLIGHT_COLORS, type HighlightColor, type HighlightLabels } from "@biblestdy/shared";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { loadPreferences, savePreferences } from "./preferences";

/**
 * The reader's own names for the highlight colours ("blue" → "God speaking"),
 * saved per account (/api/preferences). Only renamed colours are stored; the
 * rest are called by their colour, in the UI language.
 */

let labels: HighlightLabels = {};
let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function set(next: HighlightLabels) {
  labels = next;
  listeners.forEach((l) => l());
}

const EMPTY: HighlightLabels = {};
export function useHighlightLabels(): HighlightLabels {
  return useSyncExternalStore(subscribe, () => labels, () => EMPTY);
}

/** Applies the account's names (call in the read route's loader). */
export async function loadHighlightLabels(userId: string): Promise<void> {
  const prefs = await loadPreferences(userId);
  if (prefs?.highlightLabels) set(prefs.highlightLabels);
}

/** Renamed in the colour names dialog: shows at once, then persists (the
 * whole map — a missing colour is back to its colour name). A failed save
 * puts the old names back. */
export async function saveHighlightLabels(next: HighlightLabels): Promise<void> {
  const prev = labels;
  set(next);
  try {
    await savePreferences({ highlightLabels: next });
  } catch (e) {
    if (labels === next) set(prev);
    throw e;
  }
}

/** The naming fields (colour key, settings dialog) → the names to save:
 * spaces tidied; an empty field = the colour's own name (not stored). */
export function cleanLabels(draft: Partial<Record<HighlightColor, string>>): HighlightLabels {
  const next: HighlightLabels = {};
  for (const c of HIGHLIGHT_COLORS) {
    const name = (draft[c] ?? "").replace(/\s+/gu, " ").trim();
    if (name) next[c] = name;
  }
  return next;
}

/** First letter up ("gold" → "Gold") for a name standing on its own. */
export const upFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * What a colour is called, everywhere it's named:
 * - `name(c)`: inside a sentence — "Highlight (gold)", "Highlight (God speaking)"
 * - `title(c)`: on its own (tooltips, buttons) — "Gold", "God speaking"
 * - `custom(c)`: the reader's own name, if they gave one
 */
export function useColorName() {
  const { t } = useTranslation();
  const own = useHighlightLabels();
  const custom = useCallback((c: HighlightColor): string | undefined => own[c], [own]);
  const name = useCallback((c: HighlightColor) => own[c] ?? t(`menu.colors.${c}`), [own, t]);
  const title = useCallback((c: HighlightColor) => own[c] ?? upFirst(t(`menu.colors.${c}`)), [own, t]);
  return { name, title, custom };
}
