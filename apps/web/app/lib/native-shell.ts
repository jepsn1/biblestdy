import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";
import { KEYBOARD_MS, panFor, shellViewportHeight } from "./keyboard-native";

/**
 * The native shell's keyboard (#273, #256) — loaded by entry.client only
 * inside Capacitor, so the web never carries it.
 *
 * - No accessory bar: the ‹ › ✓ row Safari draws over the keyboard is gone
 *   (the plugin hides it from launch; said again here). The note's own
 *   format bar docks on the keyboard instead (note-editor, app.css).
 * - Resize mode "none" (capacitor.config.ts): the web view keeps its size
 *   and the keyboard lies over it, as in Safari. "native" would shrink the
 *   web view only after the keyboard has finished sliding (the plugin waits
 *   its animation + 0.2s), so everything would jump once it's up, and the
 *   paginated reader under a note would re-lay its pages every time.
 * - The plugin takes the keyboard away from WKWebView (it removes the web
 *   view's own keyboard observers): no pan, and `visualViewport` no longer
 *   shrinks. So we give `visualViewport` the keyboard back from the
 *   plugin's events, which arrive as the slide starts — the sheet fitting
 *   (#261), the palette and the `@` menu work unchanged, in step with it.
 * - Where Safari would pan to show a field the keyboard covers (sign-in,
 *   a margin note low on the page), the page lifts by just that much.
 * - The keyboard follows the app's theme, not the phone's.
 */

const root = document.documentElement;
const real = window.visualViewport;
let keyboard = 0;

/** `window.visualViewport`, with the plugin's keyboard height in it. */
class ShellViewport extends EventTarget {
  onresize: ((e: Event) => void) | null = null;
  onscroll: ((e: Event) => void) | null = null;
  onscrollend: ((e: Event) => void) | null = null;
  get width() {
    return real?.width ?? window.innerWidth;
  }
  get height() {
    return shellViewportHeight(real?.height ?? window.innerHeight, root.clientHeight, keyboard);
  }
  get offsetLeft() {
    return real?.offsetLeft ?? 0;
  }
  get offsetTop() {
    return real?.offsetTop ?? 0;
  }
  get pageLeft() {
    return real?.pageLeft ?? 0;
  }
  get pageTop() {
    return real?.pageTop ?? 0;
  }
  get scale() {
    return real?.scale ?? 1;
  }
  emit(type: "resize" | "scroll") {
    const e = new Event(type);
    this.dispatchEvent(e);
    (type === "resize" ? this.onresize : this.onscroll)?.call(this, e);
  }
}

const viewport = new ShellViewport();
Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
real?.addEventListener("resize", () => viewport.emit("resize"));
real?.addEventListener("scroll", () => viewport.emit("scroll"));
if (!real) window.addEventListener("resize", () => viewport.emit("resize"));

root.dataset.native = "";
void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

/** A text field, where a keyboard is for. */
function field(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
}

/** The page's lift (Safari's pan, stood in for). */
let lifted = 0;
function lift(px: number) {
  if (px === lifted) return;
  lifted = px;
  const body = document.body.style;
  if (px) body.setProperty("transform", `translateY(${-px}px)`);
  else body.removeProperty("transform");
}

/** The focused field shows above the keyboard: sheets that fit themselves
 * to it (`data-kb`, lib/keyboard-fit) and fields already in sight stay put. */
function reveal() {
  const el = document.activeElement;
  if (!keyboard || !field(el) || el.closest("[data-kb]")) return lift(0);
  const r = el.getBoundingClientRect();
  lift(panFor({ top: r.top + lifted, bottom: r.bottom + lifted }, root.clientHeight - keyboard));
}

let closing = 0;
function setKeyboard(px: number) {
  const was = keyboard;
  keyboard = px;
  // One rule for "the keyboard is up" everywhere (Jonas F5): a hardware
  // keyboard's slim shortcut bar isn't one, here or in the sheet fitting
  // (lib/safe-area's keyboardUp, inlined: importing it here would split
  // it out of the reader's first-paint chunk into one of its own)
  const up = px > 150;
  root.style.setProperty("--kb-h", `${up ? px : 0}px`);
  root.toggleAttribute("data-kb-open", up);
  // Going down, the sheets ease back too (app.css), for the slide's length
  window.clearTimeout(closing);
  if (was && !px) {
    root.toggleAttribute("data-kb-closing", true);
    closing = window.setTimeout(() => root.removeAttribute("data-kb-closing"), KEYBOARD_MS + 50);
  }
  viewport.emit("resize");
  if (!px) return lift(0);
  // In step with the slide, once the sheets have fitted (their rAF)
  requestAnimationFrame(() => requestAnimationFrame(reveal));
}

void Keyboard.addListener("keyboardWillShow", (info) => setKeyboard(Math.max(0, Math.round(info.keyboardHeight))));
void Keyboard.addListener("keyboardWillHide", () => setKeyboard(0));
// From one field to the next with the keyboard up
document.addEventListener("focusin", () => {
  if (keyboard) requestAnimationFrame(reveal);
});

/** Keyboard in the app's theme (Settings → Theme), not the phone's. */
let themed: KeyboardStyle | null = null;
function matchTheme() {
  const style = root.classList.contains("dark") ? KeyboardStyle.Dark : KeyboardStyle.Light;
  if (style === themed) return;
  themed = style;
  void Keyboard.setStyle({ style }).catch(() => {});
}
matchTheme();
new MutationObserver(matchTheme).observe(root, { attributes: true, attributeFilter: ["class"] });
