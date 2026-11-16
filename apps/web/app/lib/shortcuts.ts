import { useSyncExternalStore } from "react";
import { loadPreferences, savePreferences } from "./preferences";

/**
 * Global single-key shortcuts (←/→ page turn, "/" jump box) must stay out of
 * the way (#51): never while typing (inputs, MDXEditor's contenteditable),
 * never with Alt/Ctrl/Meta (Alt+← = browser back, Ctrl+→ = word jump), never
 * while a modal is open or focus sits in a widget that owns the arrow keys
 * (select listbox, menu, slider…). Shift is allowed — "/" needs Shift on many
 * layouts (Danish: Shift+7).
 */

/** Structural subset of KeyboardEvent — keeps the helper testable in node. */
export type ShortcutEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  /** Physical key ("Slash"), for Alt+/ (Option+/ types ÷ on a Mac). */
  code?: string;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
};

type ElementLike = {
  closest?: (selector: string) => unknown;
  isContentEditable?: boolean;
  ownerDocument?: { querySelector: (selector: string) => unknown } | null;
};

/** Text entry of any kind — typing there must never page or steal focus. */
const EDITABLE = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

/** Widgets that use the arrow keys themselves. */
const ARROW_WIDGETS = [
  "[role='listbox']",
  "[role='menu']",
  "[role='menubar']",
  "[role='slider']",
  "[role='tablist']",
  "[role='radiogroup']",
  "[role='dialog']",
  "[role='alertdialog']",
  // Segmented controls (settings, #62): arrows move between options
  "[data-slot='toggle-group']",
].join(",");

/** Any open modal (style chooser, drawers, dialogs) blocks page shortcuts. */
const OPEN_MODAL = "[aria-modal='true'], dialog[open]";

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as ElementLike | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  return el.closest(EDITABLE) != null;
}

/**
 * Single-key shortcuts switch (#145, WCAG 2.1.4 Character Key Shortcuts):
 * off = no key made of a character alone (t, /, ?, [ ], V, Shift+H, 1–6,
 * h/n/m/c on a verse) does anything — speech input and switch access type
 * those by accident. Ctrl/⌘/Alt shortcuts, arrows, PgUp/PgDn, Home/End,
 * Enter/Space, Esc and F6 always work. Saved per account; every handler and
 * every place that shows a key asks here, so the two can't drift.
 */
let singleKeys = true;
let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function setSingleKeys(on: boolean) {
  if (on === singleKeys) return;
  singleKeys = on;
  listeners.forEach((l) => l());
}

export function singleKeysOn(): boolean {
  return singleKeys;
}
export function useSingleKeys(): boolean {
  return useSyncExternalStore(subscribe, () => singleKeys, () => true);
}

/** Applies the account's choice (call in the route loaders). */
export async function loadSingleKeys(userId: string): Promise<void> {
  const prefs = await loadPreferences(userId);
  if (prefs) setSingleKeys(prefs.singleKeyShortcuts !== false);
}

/** The settings switch: applies at once, then persists; a failed save puts
 * it back. */
export async function saveSingleKeys(on: boolean): Promise<void> {
  const prev = singleKeys;
  setSingleKeys(on);
  try {
    await savePreferences({ singleKeyShortcuts: on });
  } catch (e) {
    if (singleKeys === on) setSingleKeys(prev);
    throw e;
  }
}

/** A key made of one character, no Ctrl/⌘/Alt — Shift doesn't count
 * (Shift+H is still "H"). Space stays out: it activates, like Enter. */
export function isCharacterKey(event: Pick<ShortcutEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return [...event.key].length === 1 && event.key !== " ";
}

/** True when this keydown is a single-key shortcut and those are off. */
export function singleKeyOff(event: Pick<ShortcutEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): boolean {
  return !singleKeys && isCharacterKey(event);
}

/** A shown/announced key ("T", "Shift+H", "1–6", "/" — vs "mod+K", "Esc",
 * "←", "ArrowLeft") that is a single-key shortcut. */
export function isCharacterShortcut(shortcut: string): boolean {
  const k = shortcut.replace(/^Shift\+/i, "");
  return /^\d–\d$/u.test(k) || ([...k].length === 1 && !"←→↑↓".includes(k));
}

/** A hint's key or an aria-keyshortcuts list ("Meta+K Control+K /") with
 * the single-key ones dropped while they're off; undefined when none is
 * left (no empty kbd, no empty attribute). */
export function liveShortcut(shortcut: string | undefined, on = singleKeys): string | undefined {
  if (!shortcut || on) return shortcut;
  const kept = shortcut.split(" ").filter((k) => !isCharacterShortcut(k));
  return kept.length ? kept.join(" ") : undefined;
}

/** liveShortcut that re-renders when the switch flips. */
export function useLiveShortcut(): (shortcut: string | undefined) => string | undefined {
  const on = useSingleKeys();
  return (shortcut) => liveShortcut(shortcut, on);
}

/** True when a global shortcut handler must ignore this keydown. */
export function ignoreShortcut(event: ShortcutEvent, doc?: ElementLike["ownerDocument"]): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (singleKeyOff(event)) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const el = event.target as ElementLike | null;
  if (isEditableTarget(event.target)) return true;
  if (el && typeof el.closest === "function" && el.closest(ARROW_WIDGETS) != null) return true;
  const d = doc ?? el?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  return d?.querySelector(OPEN_MODAL) != null;
}

/**
 * Ctrl/⌘B opens the address chooser (was the books sidebar's key, so the
 * habit "Ctrl+B = books" carries over). Never inside an editor — Ctrl+B is
 * bold there — nor over another modal, nor when something else took it.
 */
export function opensPlaceChooser(event: ShortcutEvent & { shiftKey?: boolean }, doc?: ElementLike["ownerDocument"]): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (event.key.toLowerCase() !== "b") return false;
  if (isEditableTarget(event.target) && !(event.target as ElementLike).closest?.("[data-place-filter]")) return false;
  const el = event.target as ElementLike | null;
  const d = doc ?? el?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  // Its own popover is a dialog too: Ctrl+B there closes it again
  return d?.querySelector(`${OPEN_MODAL}, [role='dialog']:not(:has([data-place-filter]))`) == null;
}

/**
 * The search palette's keys: Ctrl/⌘K and Alt+/ from anywhere (a field and
 * the note editor too), "/" as a single-key shortcut (#145: off with them).
 * Never stacked on another modal (shortcuts list, chooser, onboarding).
 */
export function opensPalette(event: ShortcutEvent, doc?: ElementLike["ownerDocument"]): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  const el = event.target as ElementLike | null;
  const d = doc ?? el?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (d?.querySelector("[aria-modal='true'], [role='dialog'][data-open], [role='alertdialog'][data-open]")) return false;
  if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === "Slash") return true;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") return true;
  return event.key === "/" && !ignoreShortcut(event, d);
}
