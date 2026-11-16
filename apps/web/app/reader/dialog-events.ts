import { useSyncExternalStore } from "react";

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

/** Event name: the palette's "Insert verse" asks the open note's editor to
 * open its verse picker (#160). */
export const INSERT_VERSE = "biblestdy:insert-verse";

let noteEditors = 0;
const noteEditorListeners = new Set<() => void>();
const emitNoteEditors = () => noteEditorListeners.forEach((l) => l());

/** A note editor is on screen until the returned cleanup runs. */
export function noteEditorMounted(): () => void {
  noteEditors++;
  emitNoteEditors();
  return () => {
    noteEditors--;
    emitNoteEditors();
  };
}

/** True while a note editor is open (the palette offers "Insert verse"). */
export function useNoteEditorOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      noteEditorListeners.add(l);
      return () => noteEditorListeners.delete(l);
    },
    () => noteEditors > 0,
    () => false,
  );
}
