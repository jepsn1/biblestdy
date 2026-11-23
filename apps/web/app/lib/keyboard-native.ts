/**
 * Keyboard geometry for the native shell and the docked format bar (#273).
 * Pure: lib/native-shell.ts and the note editor do the DOM. Kept out of
 * lib/keyboard-fit (the reader's first paint) — only lazy chunks use it.
 */

/** iOS keyboard slide: ~250ms on a spring. The bar and the sheet's
 * fitting ride along on this (app.css `--kb-ease`). */
export const KEYBOARD_MS = 250;

/**
 * The visible height the shell reports as `visualViewport.height`.
 * @capacitor/keyboard takes the keyboard away from WKWebView (it removes
 * the web view's own keyboard observers), so the real visual viewport no
 * longer shrinks for it — the plugin's height does instead. Should a
 * WKWebView still shrink it too, the smaller one wins: never counted twice.
 */
export function shellViewportHeight(realHeight: number, layoutHeight: number, keyboard: number): number {
  return Math.max(0, Math.min(realHeight, layoutHeight - Math.max(0, keyboard)));
}

/** How far to move a scroller so the caret shows with `margin` px of air
 * inside `box` (its visible part). 0: it already shows. Up when it's above. */
export function caretDelta(
  caret: { top: number; bottom: number },
  box: { top: number; bottom: number },
  margin = 8,
): number {
  if (box.bottom - box.top <= 2 * margin) return 0;
  if (caret.bottom > box.bottom - margin) return Math.ceil(caret.bottom - box.bottom + margin);
  if (caret.top < box.top + margin) return Math.floor(caret.top - box.top - margin);
  return 0;
}

/**
 * The shell's stand-in for the pan Safari does (#273): a focused field the
 * keyboard covers — outside the sheets that fit themselves — lifts the page
 * by just enough to show it, `margin` px above the keyboard, never more
 * than the field's own top allows (it doesn't go above the screen). 0 when
 * it already shows.
 */
export function panFor(field: { top: number; bottom: number }, visibleBottom: number, margin = 12): number {
  const need = field.bottom + margin - visibleBottom;
  if (need <= 0) return 0;
  return Math.max(0, Math.round(Math.min(need, field.top - margin)));
}
