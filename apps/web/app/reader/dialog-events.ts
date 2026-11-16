/**
 * How the reader's dialogs are asked open from anywhere (settings, palette,
 * colour key). Apart from the dialogs themselves, which are code-split
 * (reader-dialogs.ts): asking must not pull them into the first load.
 */

/** Event name: anything (the settings menu) can open the shortcuts list. */
export const OPEN_SHORTCUTS = "biblestdy:shortcuts";

/** Event name: the settings open the colour names (the only way on phones;
 * on desktop the colour key names them in place too); `detail` = the
 * element focus goes back to when it closes. */
export const OPEN_COLOR_NAMES = "biblestdy:color-names";
export function openColorNames(returnTo?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(OPEN_COLOR_NAMES, { detail: returnTo ?? null }));
}
