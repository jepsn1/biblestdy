import { isNativeShell } from "./api-base";

/**
 * Native touches for the note's format bar (#273), loaded with the editor.
 * Both are no-ops on the web: no haptics there, and the keyboard goes when
 * the field lets go of focus.
 */

/** A light tap under the finger (iOS's UIImpactFeedbackGenerator, light). */
export function lightTap() {
  if (!isNativeShell()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

/** Puts the keyboard away — the job of the accessory bar's ✓ we hid. */
export function hideKeyboard() {
  if (!isNativeShell()) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return;
  }
  void import("@capacitor/keyboard").then(({ Keyboard }) => Keyboard.hide()).catch(() => {});
}
