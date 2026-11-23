import { isNativeShell } from "./api-base";

/**
 * Native touches for the note's format bar (#273), loaded with the editor.
 * Both are no-ops on the web: no haptics there, and the keyboard goes when
 * the field lets go of focus.
 */

const haptics = () => import("@capacitor/haptics");

/** Fetch the haptics chunk ahead, so the first tick isn't late. */
export function preloadTap() {
  if (isNativeShell()) void haptics().catch(() => {});
}

/** A light tap under the finger (iOS's UIImpactFeedbackGenerator, light). */
export function lightTap() {
  if (!isNativeShell()) return;
  void haptics()
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

/** Puts the keyboard away — the job of the accessory bar's ✓ we hid. */
export function hideKeyboard() {
  // Blur first: the plugin's hide only resigns the native first responder,
  // and a field still focused in the DOM may not bring the keyboard back on
  // the next tap (Jonas F1)
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (isNativeShell()) void import("@capacitor/keyboard").then(({ Keyboard }) => Keyboard.hide()).catch(() => {});
}
