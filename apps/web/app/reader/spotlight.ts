import {
  SCRIPTURE_HREF_PREFIX,
  formatScriptureHref,
  parseScriptureHref,
  resolveInChapter,
  type ChapterVerses,
  type ScriptureRef,
} from "@biblestdy/shared";
import { useEffect, useRef } from "react";
import type { NoteMark } from "./note-marks";

/** Spot id of a note's selection — matches the anchor pipeline's
 * namespaced "note:<noteId>:<anchorId>". */
export const noteMarkId = (m: { noteId: string; id: string }) => `note:${m.noteId}:${m.id}`;

/** Spot id of a note's text reference (#210): keyed by its canonical href,
 * never by the `note_ref` row id — those change on every save. */
export const refSpotId = (noteId: string, href: string) => `ref:${noteId}:${href}`;

/** The note a spot id belongs to. */
export function spotNoteId(spot: string | null): string | null {
  if (!spot) return null;
  const [kind, id] = spot.split(":");
  return (kind === "note" || kind === "ref") && id ? id : null;
}

/** A spot id from `?mark=`: a selection's own id, or a text reference's
 * canonical href with the note from `?note=`. Null when it is neither. */
export function spotFromParam(mark: string, noteId: string | null): string | null {
  if (mark.startsWith("note:")) return mark;
  if (!noteId || !mark.startsWith(SCRIPTURE_HREF_PREFIX)) return null;
  const ref = parseScriptureHref(mark);
  const href = ref && formatScriptureHref(ref);
  return href ? refSpotId(noteId, href) : null;
}

/** A spot as `?mark=`: a selection's own id, a text reference's href (its
 * note goes in `?note=`). */
export function spotParam(spot: string): string {
  return spot.startsWith("ref:") ? spot.slice(`ref:${spotNoteId(spot)}:`.length) : spot;
}

/** A text reference's spot id, or null when it has no href. */
export function refSpot(noteId: string, ref: ScriptureRef): string | null {
  const href = formatScriptureHref(ref);
  return href ? refSpotId(noteId, href) : null;
}

/** Where a spot lands in the chapter: the whole verses it touches (lit and
 * washed whole, #210 — the bracket alone shows a selection's exact words),
 * where the reader turns to, and the note mark whose label stays. */
export type SpotPlace = {
  noteId: string;
  /** The drawn mark of this reference (its bracket and label), if any. */
  markId: string | null;
  /** Touched verses (stored numbers of this chapter). */
  start: number;
  end: number;
  /** The first word: where the reader turns or scrolls to. */
  word: number;
};

/**
 * One spotlight for every reference path (#210). A selection resolves to
 * its own mark (another translation's at verse level, #159); a text
 * reference through the versification map (`local`: null until it is in —
 * the spot waits rather than land on a wrong verse) to the verse units it
 * touches here. Null when the spot isn't in this chapter (yet).
 */
export function resolveSpot(
  spot: string | null,
  noteMarks: NoteMark[],
  chapter: ChapterVerses,
  local: ((ref: ScriptureRef) => ScriptureRef | null) | null,
): SpotPlace | null {
  if (!spot) return null;
  if (spot.startsWith("note:")) {
    const m = noteMarks.find((n) => noteMarkId(n) === spot);
    if (!m) return null;
    return { noteId: m.noteId, markId: spot, start: m.startVerse, end: m.endVerse, word: m.verseLevel ? 0 : m.startWord };
  }
  const noteId = spotNoteId(spot);
  const ref = parseScriptureHref(spotParam(spot));
  if (!noteId || !ref || !local) return null;
  const here = local(ref);
  const r = here && resolveInChapter(here, chapter);
  if (!r || r === "notInTranslation") return null;
  // Its verse-level mark (noteMarksInChapter places one per verse unit), or
  // the note's own selection already marking that verse
  const own = noteMarks.filter((m) => m.noteId === noteId && m.startVerse === r.startVerse);
  const mark = own.find((m) => m.verseLevel) ?? own[0];
  return { noteId, markId: mark ? noteMarkId(mark) : null, start: r.startVerse, end: r.endVerse, word: 0 };
}

/** What the ink layers need of a spot: its verses and its mark. */
export type SpotRange = { start: number; end: number; markId?: string | null };

/** The spotlight is on another chapter on this page (the run-on spill):
 * everything here steps back, nothing is lit. */
export const SPOT_ELSEWHERE: SpotRange = { start: 1, end: 0, markId: null };

/** Does a verse range touch the spot's verses? */
export const touchesSpot = (spot: { start: number; end: number } | null, a: { startVerse: number; endVerse: number }) =>
  !!spot && a.startVerse <= spot.end && a.endVerse >= spot.start;

/** The spot's first word ("[data-verse][data-word]" selector) — from the
 * reference itself, not a wrapper span: one wholly covered by smaller marks
 * renders no wrapper of its own. */
export const spotStartSelector = (p: SpotPlace) => `[data-verse="${p.start}"][data-word="${p.word}"]`;

/** Reader's own marks outside the spotlit verses fade to this (#210 C1):
 * still there, never hidden. */
export const SPOT_FADE = 0.35;

/** Page turns keep the spotlight (#190): the foot's ‹ › buttons. A
 * references-overview row decides itself (#210): a second click ends it,
 * another row replaces it — ending it first would re-render the row before
 * its own click, and the toggle would turn it straight back on. */
const KEEPS_SPOTLIGHT = "[data-foot-end], [data-spot-row]";
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
      if (!endsSpotlight(e as KeyboardEvent, document)) return;
      endRef.current();
      // One Escape, one step (#210): the spotlight ends, the note it came
      // from stays open (its panel skips a handled Escape)
      if (e.type === "keydown") e.preventDefault();
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
