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

/** A passage to compare (#167): a selection (stored verse + word numbers,
 * in its own translation), or a typed reference in the reading translation's
 * numbering (the palette's "Compare rom 8:28"). */
export type CompareAnchor = {
  translationId: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  startWord?: number;
  endWord?: number;
};
export type CompareRange = { book: string; chapter: number; verse?: number; endChapter?: number; endVerse?: number };

/** `returnTo`: where focus goes when the dialog closes — an element, or a
 * function that puts it back itself (the reader: the selected verse, its
 * selection kept). Neither anchor nor range = the reader's own fallback
 * (selection → focused verse → first verse on the page). */
export type CompareRequest = {
  anchor?: CompareAnchor;
  range?: CompareRange;
  returnTo?: HTMLElement | (() => void) | null;
};

/** Event name: the selection menus, `p`, the palette and the translation
 * sheet open Compare translations (the dialog itself is its own chunk). */
export const OPEN_COMPARE = "biblestdy:compare";
export function openCompare(request: CompareRequest = {}) {
  window.dispatchEvent(new CustomEvent<CompareRequest>(OPEN_COMPARE, { detail: request }));
}

/** Event names the references overview (#161) sends its note's own editor,
 * dispatched on the note panel's <aside> (so only that editor hears):
 * SHOW_REF selects, scrolls to and flashes the first chip of `href`;
 * INSERT_REF puts a chip of `href` at the caret (else the note's end). The
 * editor sets `done` — still false, the plain-text stand-in has the note. */
export const SHOW_REF = "biblestdy:show-ref";
export const INSERT_REF = "biblestdy:insert-ref";
export type RefEventDetail = { href: string; text: string; done: boolean };
