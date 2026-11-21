import { useSyncExternalStore } from "react";

/**
 * Inline notices (#257, panel 2026-11-21): no toasts anywhere —
 * "Highlight removed · Undo", "Couldn't save · Retry" show as one quiet line
 * in the chrome next to the action (components/inline-notice.tsx), never
 * over the text.
 *
 * Code without UI (the data hooks) posts to a *place* by name; the screen
 * that owns that place renders `<InlineNotice place=… />`. One notice per
 * place: a newer one replaces it, except same-kind removals, which merge
 * ("3 highlights removed · Undo" undoes all three).
 *
 * Never silent: a place that isn't on screen falls back to "page" (the
 * reader's foot / bar, the Notes page), then "note" (a phone note drawer
 * hides the bar); with nothing on screen the notice waits on "page" until
 * one mounts. A place that goes away hands its notice on the same way.
 */

export type NoticeKind = "undo" | "error" | "info";
export type Place = "page" | "note" | "settings";

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
  /** "Undo" / "Retry" — runs, then the notice goes. */
  action?: { label: string; run: () => unknown };
  /** Undo/info time out (paused while hovered/focused); errors stay. */
  ms?: number;
  /** Same-kind removals merge: the group, how many, the plural message. */
  group?: string;
  count?: number;
  /** Counted per item within the group (highlight / annotation). */
  items?: Record<string, number>;
}

/** Undo stays this long with a pointer that can hover (WCAG 2.2.1)… */
export const UNDO_MS = 10_000;
/** …and this long on touch, where nothing can pause it (panel C2). */
export const UNDO_TOUCH_MS = 20_000;

/** The last pointer that pressed anything: the removal it triggered was
 * done by touch or not (a media query lies on hybrid laptops). Keys count as
 * "not touch". */
let lastPointer: string = "mouse";
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => (lastPointer = e.pointerType), { capture: true, passive: true });
  document.addEventListener("keydown", (e) => {
    if (!e.repeat) lastPointer = "mouse";
    onUndoKey(e);
  }, { capture: true });
}

/** How long Undo stays: no hover to pause it on touch. */
export function undoMs(): number {
  return lastPointer === "touch" || lastPointer === "pen" ? UNDO_TOUCH_MS : UNDO_MS;
}

/** Ctrl/Cmd+Z outside text fields runs the visible Undo (panel D6); the
 * note editor's own undo wins. */
function onUndoKey(e: KeyboardEvent) {
  if (e.repeat || e.altKey || e.shiftKey || e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey)) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) return;
  const n = visibleUndo();
  if (!n?.action) return;
  e.preventDefault();
  dismissNotice(n.id);
  void n.action.run();
}

const FALLBACK: Place[] = ["page", "note"];
const notices = new Map<Place, Notice>();
const mounted = new Map<Place, number>();
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());

function target(place: Place, except?: Place): Place {
  for (const p of [place, ...FALLBACK]) if (p !== except && mounted.get(p)) return p;
  return "page"; // waits there until a place mounts
}

/** Shows `notice` at `place` (or where it falls back to); returns its id. */
export function postNotice(place: Place, notice: Omit<Notice, "id">): number {
  const id = ++seq;
  notices.set(target(place), { ...notice, id });
  emit();
  return id;
}

/** The notice currently at `place`'s target, if it's of `group` — for
 * merging removals. */
export function pendingInGroup(place: Place, group: string): Notice | null {
  const n = notices.get(target(place));
  return n && n.group === group ? n : null;
}

/** Removes notice `id`, wherever it is. */
export function dismissNotice(id: number) {
  let changed = false;
  for (const [p, n] of notices)
    if (n.id === id) {
      notices.delete(p);
      changed = true;
    }
  if (changed) emit();
}

/** The Undo on screen at `place` (Ctrl/Cmd+Z runs it), or null. */
export function visibleUndo(place: Place = "page"): Notice | null {
  for (const p of [place, ...FALLBACK]) {
    const n = mounted.get(p) ? notices.get(p) : undefined;
    if (n?.kind === "undo" && n.action) return n;
  }
  return null;
}

/** Registers a mounted place; returns the unregister. */
export function mountPlace(place: Place): () => void {
  mounted.set(place, (mounted.get(place) ?? 0) + 1);
  emit();
  return () => {
    const n = (mounted.get(place) ?? 1) - 1;
    if (n > 0) {
      mounted.set(place, n);
      return;
    }
    mounted.delete(place);
    // Gone from the screen: its notice moves to where it can still be seen
    const left = notices.get(place);
    const to = target(place, place);
    if (left && to !== place) {
      notices.delete(place);
      notices.set(to, left);
    }
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useNotice(place: Place): Notice | null {
  return useSyncExternalStore(
    subscribe,
    () => notices.get(place) ?? null,
    () => null,
  );
}

/** What `place` shows now (tests; no subscription). */
export function peekNotice(place: Place): Notice | null {
  return notices.get(place) ?? null;
}

/** Tests only. */
export function resetNotices() {
  notices.clear();
  mounted.clear();
  seq = 0;
}
