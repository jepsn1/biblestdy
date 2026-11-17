import {
  SCRIPTURE_HREF_PREFIX,
  formatScriptureHref,
  parseScriptureHref,
  resolveInChapter,
  type ChapterVerses,
  type Note,
  type ScriptureRef,
} from "@biblestdy/shared";
import { useEffect, useRef, useSyncExternalStore } from "react";
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

/** The open note's link washes a hover shows (#213): its own verses, else
 * the links it overlaps (a reference landing inside a selection). */
export function hoveredLinks<T extends { start: number; end: number }>(links: T[], hover: { start: number; end: number } | null): T[] {
  if (!hover) return [];
  const exact = links.filter((l) => l.start === hover.start && l.end === hover.end);
  return exact.length ? exact : links.filter((l) => l.start <= hover.end && l.end >= hover.start);
}

/** Reader's own marks outside the spotlit verses fade to this (#210 C1):
 * still there, never hidden. */
export const SPOT_FADE = 0.35;

/** Page turns keep the spotlight (#190): the foot's ‹ › buttons. A
 * references-overview row and the exit line's "Vis alt" decide themselves
 * (#210, `data-spot-own`): a row's second click ends it, another row
 * replaces it — ending it first would re-render (or unmount) the control
 * before its own click runs. */
const KEEPS_SPOTLIGHT = "[data-foot-end], [data-spot-own]";
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

/**
 * Chip ↔ page, both ways (#213): hovering or focusing a chip or overview
 * row lights its link on the page; hovering a bracket or label of the open
 * note outlines its chip(s) and row. One small store, so the editor chunk
 * and the reader never import each other. Keys: a text reference's
 * canonical href ("bible:JHN.3.16") or a selection's mark id
 * ("note:<note>:<anchor>"). After 120 ms (a pass over the text stays
 * quiet); leaving clears at once. The spotlit reference's id rides along:
 * its chips take the strong wash.
 */
export type RefHover = { from: "note" | "page"; keys: string[] } | null;

const HOVER_DELAY = 120;
let hover: RefHover = null;
let spot: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Hover (or focus) on: `null` ends it at once. */
export function hoverRef(next: RefHover): void {
  clearTimeout(timer);
  if (!next) {
    if (hover) {
      hover = null;
      emit();
    }
    return;
  }
  timer = setTimeout(() => {
    hover = next;
    emit();
  }, HOVER_DELAY);
}

export function useRefHover(): RefHover {
  return useSyncExternalStore(subscribe, () => hover, () => null);
}

/** The reader's spotlight (spotlight.ts id), for the chips. */
export function setRefSpot(next: string | null): void {
  if (next === spot) return;
  spot = next;
  emit();
}

export function useRefSpot(): string | null {
  return useSyncExternalStore(subscribe, () => spot, () => null);
}

/** The page's spot id of a hover key, for the open note's links. */
export const hoverSpot = (key: string, noteId: string) => (key.startsWith("note:") ? key : refSpotId(noteId, key));

/**
 * The reader's side (#213): where the hovered link lands in this chapter
 * (drawn like the spotlight's mark, no muting — never while one is on), and
 * what a hover on the open note's bracket or label says to its chips and
 * rows: the mark itself (a selection's row) and every text reference that
 * lands on it. Also hands the spotlight to the chips.
 */
export function usePageHover(
  openNote: Note | null,
  noteMarks: NoteMark[],
  chapter: ChapterVerses,
  local: ((ref: ScriptureRef) => ScriptureRef | null) | null,
  spotId: string | null,
): { hover: SpotPlace | null; onHoverMark: (markKey: string | null) => void } {
  const h = useRefHover();
  useEffect(() => setRefSpot(spotId), [spotId]);
  useEffect(() => () => setRefSpot(null), []);
  const noteId = openNote?.id;
  let hover: SpotPlace | null = null;
  if (h && noteId && !spotId)
    for (const k of h.keys) if ((hover = resolveSpot(hoverSpot(k, noteId), noteMarks, chapter, local))) break;
  const onHoverMark = (markKey: string | null) => {
    if (!markKey || !openNote) return hoverRef(null);
    const hrefs = (openNote.refs ?? [])
      .map((r) => formatScriptureHref(r))
      .filter((href): href is string => !!href && resolveSpot(refSpotId(openNote.id, href), noteMarks, chapter, local)?.markId === markKey);
    hoverRef({ from: "page", keys: [markKey, ...hrefs] });
  };
  return { hover, onHoverMark };
}
