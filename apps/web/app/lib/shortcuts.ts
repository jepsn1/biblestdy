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
].join(",");

/** Any open modal (style chooser, drawers, dialogs) blocks page shortcuts. */
const OPEN_MODAL = "[aria-modal='true'], dialog[open]";

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as ElementLike | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  return el.closest(EDITABLE) != null;
}

/** True when a global shortcut handler must ignore this keydown. */
export function ignoreShortcut(event: ShortcutEvent, doc?: ElementLike["ownerDocument"]): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const el = event.target as ElementLike | null;
  if (isEditableTarget(event.target)) return true;
  if (el && typeof el.closest === "function" && el.closest(ARROW_WIDGETS) != null) return true;
  const d = doc ?? el?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  return d?.querySelector(OPEN_MODAL) != null;
}
