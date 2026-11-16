import { type Anchor, type Chapter, words, wordRangeInVerse } from "@biblestdy/shared";
import { useEffect, useRef } from "react";

/** Spotlight id of a note's reference — matches the anchor pipeline's
 * namespaced "note:<noteId>:<anchorId>". */
export const noteMarkId = (m: { noteId: string; id: string }) => `note:${m.noteId}:${m.id}`;

/**
 * Words ("verse:word") of the reference selected in the note panel: they stay
 * in full ink while the rest of the page mutes. Taken from the reference's
 * own word range, never from which mark won a word's click coverage — a pen
 * mark, another note or a straddling mark over some of its words would
 * otherwise leave muted holes inside the spotlit passage.
 */
export function spotlitWords(
  verses: Chapter["verses"],
  noteMarks: (Anchor & { noteId: string; id: string })[],
  selectedMarkId: string | null,
): Set<string> {
  const lit = new Set<string>();
  const mark = selectedMarkId == null ? undefined : noteMarks.find((m) => noteMarkId(m) === selectedMarkId);
  if (!mark) return lit;
  for (const v of verses) {
    const range = wordRangeInVerse(mark, v.verse, words(v.text).length);
    if (!range) continue;
    for (let w = range.start; w <= range.end; w++) lit.add(`${v.verse}:${w}`);
  }
  return lit;
}

/**
 * The first word of a note's reference ("[data-verse][data-word]" selector) —
 * where the reader turns or scrolls to. From the reference's own anchor, not
 * its wrapper span: a reference wholly covered by smaller marks renders no
 * wrapper of its own. Null until the mark is known (notes still loading).
 */
export function markStartSelector(
  noteMarks: (Anchor & { noteId: string; id: string })[],
  markId: string,
): string | null {
  const m = noteMarks.find((n) => noteMarkId(n) === markId);
  return m ? `[data-verse="${m.startVerse}"][data-word="${m.startWord}"]` : null;
}

/** Page turns keep the spotlight (#190): the foot's ‹ › buttons. */
const KEEPS_SPOTLIGHT = "[data-foot-end]";
/** Something above the page that Escape closes first (menu, dialog). */
const ESCAPE_OWNER = "[role='menu'][data-open], [role='dialog'][data-open], [role='alertdialog'][data-open], [aria-modal='true']";

/**
 * Does this event end the reference spotlight (#190)? It has no timer: it
 * stays until the next click or tap anywhere — the text included — except
 * a page turn, or Escape once nothing above the page wants it. A touch
 * scroll or swipe is no click, so it keeps the spotlight too.
 */
export function endsSpotlight(
  e: { type: string; key?: string; target: EventTarget | null },
  doc: Pick<Document, "querySelector">,
): boolean {
  if (e.type === "click") {
    const el = e.target as Element | null;
    return !el?.closest?.(KEEPS_SPOTLIGHT);
  }
  if (e.type === "keydown") return e.key === "Escape" && !doc.querySelector(ESCAPE_OWNER);
  return false;
}

/**
 * While `active`, the next ending click (capture phase: before the press's
 * own handler, so a click on another reference replaces this one) or
 * Escape calls `end`.
 */
export function useSpotlightEnd(active: boolean, end: () => void) {
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => {
    if (!active) return;
    const on = (e: Event) => {
      if (endsSpotlight(e as KeyboardEvent, document)) endRef.current();
    };
    document.addEventListener("click", on, true);
    // Capture: read before a menu's own Escape closes it
    document.addEventListener("keydown", on, true);
    return () => {
      document.removeEventListener("click", on, true);
      document.removeEventListener("keydown", on, true);
    };
  }, [active]);
}
