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
 * the reader's own keys (shortcuts, Enter on a verse, arrows paging) — then
 * handed to the input. Enter is remembered and replayed as "go" there.
 */
type Typeahead = { text: string; enter: boolean };
let typed: Typeahead = { text: "", enter: false };
let stopTypeahead: (() => void) | null = null;

/** The phone trigger's hidden input (keeps the iOS keyboard up): Android
 * keyboards send `key: "Unidentified"`, their text only lands in there. */
export const PALETTE_PROXY = "data-palette-proxy";

export function startTypeahead() {
  takeTypeahead();
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    // Focus reached a dialog (the palette's input): it types for itself
    if ((e.target as Element | null)?.closest?.("[role=dialog]")) return;
    if (e.key === "Escape" || e.key === "Shift") return; // Esc: lazy-palette cancels
    if (e.key === "Backspace") typed.text = typed.text.slice(0, -1);
    else if (e.key === "Enter") typed.enter = true;
    else if (e.key.length === 1 && !typed.enter) typed.text += e.key;
    // Unidentified (Android) passes on to the proxy input; the rest is swallowed
    if (e.key === "Unidentified") return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("keydown", onKey, true);
  // Never outlives a palette that didn't open (a very slow chunk still fits)
  const timer = window.setTimeout(() => takeTypeahead(), 30_000);
  stopTypeahead = () => {
    window.removeEventListener("keydown", onKey, true);
    window.clearTimeout(timer);
  };
}

/** The keys kept so far (and whether Enter was pressed); stops keeping them. */
export function takeTypeahead(): Typeahead {
  stopTypeahead?.();
  stopTypeahead = null;
  const proxy = document.querySelector<HTMLInputElement>(`[${PALETTE_PROXY}]`);
  const t = { text: typed.text + (proxy?.value ?? ""), enter: typed.enter };
  if (proxy) proxy.value = "";
  typed = { text: "", enter: false };
  return t;
}
