import { lazyModule } from "~/lib/lazy-module";

/**
 * Opening the command palette, kept apart from the palette itself (M8): the
 * nav's trigger and its keys load eagerly, the palette is its own chunk.
 */

/** Event name: the nav's search button opens the palette. */
export const OPEN_PALETTE = "biblestdy:palette";

/** Where focus was when the palette opened (Esc returns there). */
let opener: HTMLElement | null = null;
export function paletteOpener() {
  return opener;
}

export function openPalette() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.dispatchEvent(new Event(OPEN_PALETTE));
}

/** The palette's chunk — preloaded on idle and on hover/focus of the trigger. */
export const palette = lazyModule(() => import("./command-palette"));

/**
 * Type-ahead: ⌘K then typing at once must not lose the first keys. Between
 * the open and the palette's input taking focus (a render, the dialog's open,
 * on a cold start the chunk's download) keys are kept here — and kept from
 * the reader's own single-key shortcuts — then handed to the input.
 */
let typed = "";
let stopTypeahead: (() => void) | null = null;

export function startTypeahead() {
  takeTypeahead();
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    // Focus reached a dialog (the palette's input): it types for itself
    if ((e.target as Element | null)?.closest?.("[role=dialog]")) return;
    if (e.key === "Backspace") typed = typed.slice(0, -1);
    else if (e.key.length === 1) typed += e.key;
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("keydown", onKey, true);
  // Never outlives a palette that didn't open
  const timer = window.setTimeout(() => takeTypeahead(), 5000);
  stopTypeahead = () => {
    window.removeEventListener("keydown", onKey, true);
    window.clearTimeout(timer);
  };
}

/** The keys kept so far; stops keeping them. */
export function takeTypeahead(): string {
  stopTypeahead?.();
  stopTypeahead = null;
  const t = typed;
  typed = "";
  return t;
}
