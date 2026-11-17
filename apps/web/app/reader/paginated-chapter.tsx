import { useTranslation } from "react-i18next";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS, translationInfo, type Anchor, type Chapter, type HighlightColor, type NoteAnchor, type ScriptureRef, type Translation } from "@biblestdy/shared";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Drawer, DrawerContent } from "~/components/lazy-drawer";
import { authClient } from "~/lib/auth-client";
import { bookLocale, useBookName } from "~/lib/book-name";
import { useFumsView } from "~/lib/fums";
import { useTextSize, useViewportFits } from "~/lib/text-size";
import { ignoreShortcut } from "~/lib/shortcuts";
import { ChevronUp } from "lucide-react";
import { cn, focusRing } from "~/lib/utils";
import {
  adjacentChapter,
  type ChapterRef,
  chapterHref,
  lastReadValue,
  parsePageParam,
  parseVerseParam,
  resolvePage,
  schemeOf,
  targetVerses,
  type VerseRange,
  type WantedPage,
} from "./chapter-nav";
import { chapterArriving, prefetchNeighbours, useChapterText, warmChapter } from "./chapter-cache";
import { SkeletonLines } from "./chapter-skeleton";
import { useMeasure } from "./use-measure";
import { ChapterSpill, type RunOn } from "./chapter-spill";
import { ChapterText } from "./chapter-text";
import { VERSE_FOCUS } from "./keyboard-selection";
import { ConnectionsPanel } from "./connections-panel";
import { HighlightMarks } from "./highlight-marks";
import { NOTE_OPENER, NotePanel } from "./note-panel";
import { readHref } from "../notes/verse-resolver";
import { noteEditor } from "./note-editor-loader";
import { preloadWhenIdle } from "~/lib/lazy-module";
import { boxesFitLane, crossingSlide, LANE, PAD, pagedFits, RAIL, sheetLayout, stripFits, type Span } from "./sheet-layout";
import { AnnotationMarks } from "./annotation-marks";
import { MarksLoadError, useMarksLoad } from "./marks-load-error";
import { CreditParts, PageFoot, type FootButton } from "./page-foot";
import { API_BIBLE_URL } from "~/lib/app-info";
import { ChapterStrip } from "./chapter-strip";
import { notePage } from "~/lib/recent-passages";
import { scrollsItself, wheelTurner } from "./wheel-turn";
import { PEN_STYLES, TOOL_KEYS, ToolPalette, ToolStatus, type PenStyle, type ReaderTool, type ToolKind } from "./tool-palette";
import { useLocalizer } from "./localizer";
import { needsMap, noteMarksInChapter } from "./note-marks";
import { useAllNotesQuery, useNotes } from "./use-notes";
import type { RefLocator } from "./ref-location";
import { noteMarkId, refSpot, resolveSpot, spotFromParam, spotParam, spotStartSelector, useSpotlightEnd } from "./spotlight";
import { chipLabel } from "~/lib/reference-label";
import { pageSpan, placeSelector, reflowPage, type Place } from "./reading-place";
import { useHighlights } from "./use-highlights";
import { ColourKey } from "./colour-key";
import { turnStill } from "./turn-still";
import { revealColor, setHighlightFilter, useHighlightFilter } from "~/lib/highlight-filter";
import { useAnnotations } from "./use-annotations";

/** Which page an element is on, for a whole scan: the content box is read
 * once, not per element. */
function pageReader(content: HTMLElement | null, pageStride: number): ((el: Element) => number) | null {
  if (!content || pageStride <= 0) return null;
  const contentRect = content.getBoundingClientRect();
  const s = contentRect.width / content.offsetWidth || 1;
  // By its centre: a drop numeral (negative margin) or a hanging line
  // starts a hair left of its column, which read as the page before
  return (el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.floor(((r.left + r.right) / 2 - contentRect.left) / s / pageStride));
  };
}

/** The chapter text container: target of the "Skip to text" link (#61). */
export const CHAPTER_TEXT_ID = "chapter-text";

/** Reader area (rem) below which side panels open as drawers: note panel
 * minimum (35rem) + a ~20rem reading column. ~880px at 100%. */
const SIDE_BY_SIDE_MIN = 55;

/** Longest a chapter crossing waits for the next chapter (fetch, layout)
 * before going ahead anyway. */
const CROSS_WAIT_MS = 600;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Chapters run on (#flow): a page turn into a chapter whose opening the
 * page before already showed carries on from `flowFrom` (history state, so
 * reload and Back lay out the same pages; any other way in = whole chapter).
 * `from`: the chapter whose last page that was, when it also carried whole
 * chapters in between (short psalms) — turning back goes there. */
type FlowState = { flowFrom?: number; from?: ChapterRef };
/** Most chapters one last page carries (a whole short one lets the next run
 * on below it). */
const MAX_RUN_ON = 3;
/** Where each chapter last started (by translation/book.chapter): turning
 * back into it lays it out the same way, so its last page is the page the
 * reader just came from. */
const flowStarts = new Map<string, FlowState | null>();

/** Phones (< sm) read in one scrolling column; wider screens page a spread
 * — unless large text leaves the page too few rem for its measure. */
const SCROLL_MODE_QUERY = "(max-width: 639.98px)";

/** First-use hint (#63) dismissed, or the reader has used the study tools. */
const HINT_DONE_KEY = "firstUseHintDone";
function readHintDone() {
  try {
    return localStorage.getItem(HINT_DONE_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag every visit
  }
}

/** Does the paged sheet carry the chapter strip (the top bar's chapter
 * chooser steps aside)? Paged, and tall enough in rem (sheet-layout). */
export function useChapterStrip() {
  const tall = useViewportFits(stripFits, true, "height");
  return !useScrollMode() && tall;
}

/** Phone layout, or large text the paged sheet can't hold: one scrolling
 * column, no pages. */
export function useScrollMode() {
  const paged = useViewportFits(pagedFits);
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia(SCROLL_MODE_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(SCROLL_MODE_QUERY);
    const onChange = () => setPhone(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return phone || !paged;
}

/**
 * Two layouts (#44), same text + ink layers:
 * - Desktop: book-style 2-col spread. The chapter flows through capped-height
 *   CSS columns ([column-fill:auto]), overflowing horizontally; each "page"
 *   is one spread width. We translate the flow sideways — no body scroll.
 * - Phone: one ragged-right column scrolling vertically inside a ScrollArea
 *   (still no body scroll). No paging.
 * Ink (highlights, scribbles, note chips) is measured from the word spans in
 * the region's local space, so it lands on the right words in both.
 */
export function PaginatedChapter({
  chapter,
  translation,
  translations,
  heading,
  prevChapter,
  nextChapter,
  sideView,
  onSideViewChange,
  annotationBoxesOpen,
  placeRef,
  onSpreadEnd,
}: {
  chapter: Chapter;
  translation: Translation;
  /** Every translation (names "Written in WEB" in the Notes panel, #159). */
  translations: Translation[];
  heading: string;
  /** Neighbouring chapters, across book boundaries (#52); null at the ends. */
  prevChapter: ChapterRef | null;
  nextChapter: ChapterRef | null;
  /** The single side slot: 'connections' | a note id | null. */
  sideView: string | null;
  onSideViewChange: (view: string | null) => void;
  /** Mobile annotation layer (#15): boxes shown only while toggled on. */
  annotationBoxesOpen: boolean;
  /** Out: the verse the reader is at (the translation switch lands on it). */
  placeRef?: React.MutableRefObject<number | null>;
  /** Out (#146): the last chapter this spread shows when chapters run on
   * (Salme 23's last spread also holds 24 → 24), else null. */
  onSpreadEnd?: (lastChapter: number | null) => void;
}) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const nameOf = useBookName();
  /** This translation's chapter counts (BPH: Joel 4, Malachi 3). */
  const scheme = schemeOf(translation.abbreviation);
  useFumsView(chapter);
  /** Chapter–verse separator in the UI language: "3:16" / "3,16". */
  const sep = bookLocale(i18n.language) === "da" ? "," : ":";
  const contentRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Page kept in the URL (#52): `?p=N` (1-based) or `?p=last` (arriving
  // backwards). The wanted page holds until the reader turns a page, so a
  // webfont re-measure still lands on it; null = the reader took over.
  const wantedPage = useRef<WantedPage | null>(null);
  /** Last `?p` value we wrote (router state lags a few renders behind). */
  const writtenP = useRef<string | null>(null);
  // Verse target (#53): `?v=` wins over `?p`. Held (like wantedPage) until the
  // reader turns a page, so re-measures keep the verse's page.
  const wantedVerse = useRef<number | null>(null);
  /** Bumped per verse jump: re-resolves the page even when nothing else moved. */
  const [verseTick, setVerseTick] = useState(0);
  /** Bumped when webfonts land: the words rewrap, so the page's verse range
   * (running foot) and Tab stop are read again. */
  const [fontTick, setFontTick] = useState(0);
  const [flash, setFlash] = useState<VerseRange | null>(null);
  const [page, setPage] = useState(() => {
    const wanted = parsePageParam(searchParams.get("p"));
    return wanted === "last" ? 0 : wanted;
  });
  const [pageCount, setPageCount] = useState(1);
  const [stride, setStride] = useState(0);
  /** Chapter whose page has been resolved against a real measurement. */
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  /** Slide only for the reader's own page turns, never on arrival. */
  const [animate, setAnimate] = useState(false);
  // Tool palette (desktop): Select by default; the highlighter starts in the
  // reader's own colour until they pick another
  const { data: session } = authClient.useSession();
  const prefColor = session?.user.defaultHighlightColor;
  const [toolPick, setToolPick] = useState<{ kind: ToolKind; color: HighlightColor | null; pen: PenStyle }>({
    kind: "select",
    color: null,
    pen: "text",
  });
  const tool: ReaderTool = {
    kind: toolPick.kind,
    pen: toolPick.pen,
    color:
      toolPick.color ??
      (HIGHLIGHT_COLORS.includes(prefColor as HighlightColor) ? (prefColor as HighlightColor) : DEFAULT_HIGHLIGHT_COLOR),
  };
  /** Mid-slide: pane-fixed margin ink waits (see AnnotationMarks). */
  const [turning, setTurning] = useState(false);
  /** Inside the content box, sliding with the text: circles/brackets. */
  const [penHost, setPenHost] = useState<HTMLDivElement | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  /** The spotlit reference (#210), whatever path asked for it: a note's
   * selection ("note:<note>:<anchor>") or text reference ("ref:<note>:<href>",
   * by canonical href) — see spotlight.ts. */
  const [spotId, setSpotId] = useState<string | null>(null);
  /** Phone (#195): the note drawer folded down to a bar, so the reference
   * it just spotlit in the text shows. The note stays mounted (nothing is
   * lost); the bar's tap brings it back up. */
  const [notePeek, setNotePeek] = useState(false);
  const peekRef = useRef<HTMLButtonElement>(null);
  // Folding hides the row that had focus: focus goes to the bar (one tap,
  // or Enter, back to the note); unfolding hands it back to that row
  const foldedFrom = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (notePeek) peekRef.current?.focus({ preventScroll: true });
  }, [notePeek]);
  function unfoldNote() {
    setNotePeek(false);
    requestAnimationFrame(() => foldedFrom.current?.focus({ preventScroll: true }));
  }

  const {
    highlights: allHighlights,
    loaded: highlightsLoaded,
    add: addHighlight,
    remove,
    recolor: recolorHighlight,
  } = useHighlights(
    chapter.translationId,
    chapter.book,
    chapter.chapter,
    chapter,
  );
  // The colour key's filter: other colours turn see-through (still there,
  // still clickable). Marking in a faded colour brings it back.
  const highlightFilter = useHighlightFilter();
  const highlights = allHighlights;
  const add: typeof addHighlight = (anchor, color) => {
    setHighlightFilter(revealColor(highlightFilter, color));
    return addHighlight(anchor, color);
  };
  const recolor: typeof recolorHighlight = (id, color) => {
    setHighlightFilter(revealColor(highlightFilter, color));
    return recolorHighlight(id, color);
  };
  const annotationsApi = useAnnotations(chapter.translationId, chapter.book, chapter.chapter, chapter);
  const notesApi = useNotes(chapter.translationId, chapter.book, chapter.chapter);
  const { notes: allNotes, loaded: allNotesLoaded, failed: allNotesFailed } = useAllNotesQuery(true);
  // A failed load is said (MarksLoadError), never shown as "no marks here"
  // — this chapter's, or the run-on next chapter's
  const { failed: marksFailed, retry: retryMarks } = useMarksLoad();
  const focusText = useCallback(() => document.getElementById(CHAPTER_TEXT_ID), []);
  /** Where the load-error line goes: laid over the sheet just under the
   * running foot (`top`, px), so it takes no room from the columns — or, when
   * it can't fit there in one go (large text in a narrow pane), in the flow
   * above the foot (`inFlow`: the page re-lays out once, never covering the
   * page-turn buttons or clipping Retry). Measured only while it shows. */
  const [errorPlace, setErrorPlace] = useState<{ top: number; inFlow: boolean } | null>(null);
  const errorGhostRef = useRef<HTMLParagraphElement>(null);
  // The selection being made — its wash is painted with the highlights
  const [selection, setSelection] = useState<Anchor | null>(null);
  const onSelectionChange = useCallback((a: Anchor | null) => setSelection(a), []);
  /** The verse Tab lands on (#65) — kept on the current page. */
  const [rovingVerse, setRovingVerse] = useState<number | null>(null);
  /** Verses with words on the current page (folio range, #66). */
  const [pageVerses, setPageVerses] = useState<{ first: number; last: number } | null>(null);
  /** Reading place across reflows (#66): see the effect near the keys. A
   * word (#203): the page's first verse can start on the page before. */
  const readingPlace = useRef<Place | null>(null);
  const placePage = useRef<number | null>(null);
  const restoring = useRef(false);
  const layoutSig = useRef("");
  // Refs and other translations' anchors through the versification map
  // (#163), a lazy chunk: those marks wait for it
  const localize = useLocalizer(chapter.translationId, needsMap(notesApi.notes, chapter.translationId));
  const noteMarks = noteMarksInChapter(notesApi.notes, chapter, localize);
  /** Stored (canonical) numbers here, once the map is in (null meanwhile). */
  const localLookup = useMemo(
    () => (localize ? (r: ScriptureRef) => localize.local(r)?.ref ?? null : null),
    [localize],
  );
  /** Where the spotlit reference lands in this chapter (#210); null = none here. */
  const spotPlace = resolveSpot(spotId, noteMarks, chapter, localLookup);
  // ?note=<id> keeps the panel open across chapter navigation (references
  // table jumps); ?mark=<mark id> flips to the linked span and flashes it.
  const openNoteId = sideView !== null && sideView !== "connections" ? sideView : null;
  /** Opening a note borrows the side slot; closing falls back to the sticky
   * connections preference. */
  const setOpenNoteId = (id: string | null) => {
    setNotePeek(false);
    onSideViewChange(
      id ?? (localStorage.getItem("connectionsOpen") === "1" ? "connections" : null),
    );
  };
  /** Open a note from its mark on the page (margin label, the marked words,
   * a phone marker), at the clicked word or the mark's first (#203). Opening
   * narrows the sheet to one column: the place moves there first, so the
   * reflow turns to the page that holds it rather than the old spread's first
   * verse — and closing (the reflow back) returns to that same spread. */
  const openNoteAt = (id: string, at?: Place) => {
    if (at && !scrollMode) {
      readingPlace.current = at;
      // The reader moved on from a ?v= target or a ?p=last arrival
      wantedVerse.current = null;
      if (wantedPage.current === "last") wantedPage.current = null;
    }
    setOpenNoteId(id);
  };
  // ?note=<id> (cross-chapter reference jump) claims the slot on arrival
  const wantedNote = searchParams.get("note");
  useEffect(() => {
    if (!wantedNote) return;
    noteEditor.preload(); // in parallel with the notes list it waits on
    onSideViewChange(wantedNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedNote]);
  // The note editor is its own chunk (M8): fetch it once the chapter has
  // painted and the browser is idle, or at once when a note is about to open
  // (pointer over / focus on a note chip) — opening one then feels instant
  useEffect(() => preloadWhenIdle(noteEditor), []);
  useEffect(() => {
    const onIntent = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(`[${NOTE_OPENER}]`)) noteEditor.preload();
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
    };
  }, []);
  // An open note may have no anchor here (opened, then detached from this
  // chapter) — the all-notes list still has it.
  const openNote =
    notesApi.notes.find((f) => f.id === openNoteId) ??
    allNotes.find((f) => f.id === openNoteId) ??
    null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollMode = useScrollMode();
  const strip = useChapterStrip();
  // Chapters run on (#flow). Where this one starts: after the verses the
  // page before already carried (a page turn), else at its first verse.
  // Phones scroll the whole chapter.
  const location = useLocation();
  const flow = location.state as FlowState | null;
  const carried = flow?.flowFrom;
  const flowFrom =
    !scrollMode &&
    typeof carried === "number" &&
    carried > (chapter.verses[0]?.verse ?? 0) &&
    chapter.verses.some((v) => v.verse === carried)
      ? carried
      : null;
  /** Back over chapters the page before carried whole (#flow). */
  const backTo =
    !scrollMode && typeof flow?.from?.book === "string" && typeof flow.from.chapter === "number"
      ? { book: flow.from.book, chapter: flow.from.chapter }
      : null;
  /** Kept on every URL write of ours (?p, ?v, ?note, ?mark). */
  const flowState: FlowState | null =
    flowFrom !== null || backTo ? { ...(flowFrom !== null && { flowFrom }), ...(backTo && { from: backTo }) } : null;
  /** The chapter's own text (the flow may also carry the next one's opening). */
  const mainRef = useRef<HTMLDivElement>(null);
  /** What runs on below this chapter's end, on its last page (ChapterSpill):
   * the next chapter's opening — or, when it fits whole, it and the next
   * one's opening (a chain, same book, MAX_RUN_ON at most). */
  const spillBoxRef = useRef<HTMLDivElement>(null);
  const section0 = useRef<HTMLDivElement>(null);
  const section1 = useRef<HTMLDivElement>(null);
  const section2 = useRef<HTMLDivElement>(null);
  const sectionRefs = [section0, section1, section2];
  const chain: (ChapterRef | null)[] = [];
  for (let i = 0; i < MAX_RUN_ON; i++) {
    const ref = i === 0 ? (scrollMode ? null : nextChapter) : chain[i - 1] && adjacentChapter(chain[i - 1]!, 1, scheme);
    chain.push(ref?.book === chapter.book ? ref : null);
  }
  const [runOns, setRunOns] = useState<(RunOn | null)[]>(() => Array(MAX_RUN_ON).fill(null));
  // Run-on text is needed (fetched, not just read ahead) from the page before
  // the last one: it is ready by the time the reader gets there. A section
  // below a run-on chapter is needed once the one above fit whole.
  const nearEnd = !scrollMode && page >= pageCount - 2;
  const chainLoads = [
    useChapterText(chapter.translationId, chain[0], nearEnd),
    useChapterText(chapter.translationId, chain[1], nearEnd && runOns[0]?.nextFrom === null),
    useChapterText(chapter.translationId, chain[2], nearEnd && runOns[0]?.nextFrom === null && runOns[1]?.nextFrom === null),
  ];
  const chainTexts = chainLoads.map((l) => l.text);
  const reportRunOn = useMemo(
    () =>
      Array.from({ length: MAX_RUN_ON }, (_, i) => (runOn: RunOn | null) =>
        setRunOns((list) => (list[i] === runOn ? list : list.map((x, j) => (j === i ? runOn : x))))),
    [],
  );
  /** A section runs on once the one above it fit whole. */
  const sectionShown = (i: number): boolean =>
    !!chain[i] && !!chainTexts[i] && (i === 0 || (sectionShown(i - 1) && runOns[i - 1]?.nextFrom === null));
  // Where Next goes from the last page: the first chapter not wholly shown,
  // on from its first verse not shown (else from its start)
  let onward: ChapterRef | null = nextChapter;
  let onwardState: FlowState | null = null;
  let lastRunOn: { ref: ChapterRef; runOn: RunOn } | null = null;
  for (let i = 0; i < MAX_RUN_ON && sectionShown(i) && runOns[i]; i++) {
    const ref = chain[i]!;
    const runOn = runOns[i]!;
    lastRunOn = { ref, runOn };
    if (runOn.nextFrom !== null) {
      onward = ref;
      onwardState = { flowFrom: runOn.nextFrom };
      break;
    }
    onward = adjacentChapter(ref, 1, scheme);
    onwardState = null;
  }
  // Near the end, read ahead what runs on to the next chapter's last page
  // (a short psalm is all last page): ready before the reader gets there
  const onwardAfter = onward && adjacentChapter(onward, 1, scheme);
  const lookAhead = nearEnd && onward ? [onward, onwardAfter?.book === onward.book ? onwardAfter : null] : [];
  const lookAheadKey = lookAhead.map((r) => r && `${r.book}.${r.chapter}`).join();
  useEffect(() => {
    if (lookAhead.length) prefetchNeighbours(chapter.translationId, lookAhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookAheadKey stands for lookAhead
  }, [lookAheadKey, chapter.translationId]);
  // Skipping chapters carried whole: turning back returns to this page
  if (onward && nextChapter && (onward.book !== nextChapter.book || onward.chapter !== nextChapter.chapter))
    onwardState = { ...onwardState, from: { book: chapter.book, chapter: chapter.chapter } };
  /** The first run-on section still on its way (or waiting out the reading
   * quota): a skeleton holds its place on the last page. */
  const pendingAt = chain.findIndex(
    (ref, i) => ref && !chainTexts[i] && chainLoads[i].pending && (i === 0 || (sectionShown(i - 1) && runOns[i - 1]?.nextFrom === null)),
  );
  const pendingSpill = pendingAt >= 0 ? chainLoads[pendingAt] : null;
  const [washHost, setWashHost] = useState<HTMLDivElement | null>(null);
  const [marginHost, setMarginHost] = useState<HTMLDivElement | null>(null);
  // Split width is a per-device ergonomic preference -> localStorage, not DB
  const [noteSize, setNoteSize] = useState(() => {
    if (typeof localStorage === "undefined") return 50;
    const v = Number(localStorage.getItem("notePanelSize"));
    return v >= 20 && v <= 65 ? v : 50;
  });

  function onSplitChange(layout: Record<string, number>, meta: { isUserInteraction: boolean }) {
    if (!meta.isUserInteraction || !openNote) return;
    const reader = layout.reader;
    const note = layout.note;
    if (typeof reader !== "number" || typeof note !== "number") return;
    const pct = (note / (reader + note)) * 100;
    setNoteSize(pct);
    localStorage.setItem("notePanelSize", String(pct));
  }

  const viewportOf = () =>
    scrollRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

  // Desktop sheet fit (#51): the pane's width (in rem) picks spread vs one
  // column and whether annotation lanes get margin — never a sideways scroll.
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, rem: 16 });
  // Text size (#61) changes the rem without resizing the pane: re-measure
  const textSize = useTextSize();
  // The load-error line's place under the foot (paged sheet only)
  useLayoutEffect(() => {
    const box = contentBoxRef.current;
    const region = regionRef.current;
    const ghost = errorGhostRef.current;
    if (!marksFailed || scrollMode || !box || !region || !ghost) return setErrorPlace(null);
    const measure = () => {
      const foot = box.querySelector(".chapter-foot");
      if (!foot) return;
      const top = foot.getBoundingClientRect().bottom - region.getBoundingClientRect().top;
      const fits = ghost.offsetHeight <= region.clientHeight - top;
      // Once in the flow, it stays there for this failure: no flip-flopping
      setErrorPlace((prev) => ({ top, inFlow: Boolean(prev?.inFlow) || !fits }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(ghost);
    const foot = box.querySelector(".chapter-foot");
    if (foot) observer.observe(foot);
    return () => observer.disconnect();
  }, [marksFailed, scrollMode, textSize]);
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el || scrollMode) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = el.clientWidth;
      setPane((p) => (p.width === width && p.rem === rem ? p : { width, rem }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollMode, textSize]);
  // Side panels (#61): beside the reader only when both fit — at a large text
  // size the note's 35rem minimum would crush the reader, so they become the
  // phone's bottom drawers instead. Measured on the whole reader area (the
  // pane above shrinks when a panel opens).
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaRem, setAreaRem] = useState(0);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || scrollMode) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setAreaRem(el.clientWidth / rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollMode, textSize]);
  const sideInDrawer = scrollMode || (areaRem > 0 && areaRem < SIDE_BY_SIDE_MIN);
  // Unmeasured (first paint): assume a roomy pane; the layout effect corrects
  // it before the browser paints.
  const paneRem = pane.width ? pane.width / pane.rem : 120;
  const hasAnnotations = annotationsApi.annotations.length > 0;
  // Annotations off the text (#63): margin boxes only where a real lane
  // fits; otherwise (phones, large text, narrow panes) each prints as a line
  // under its verse. Note chips alone get a narrower rail.
  const marginBoxes =
    !scrollMode && hasAnnotations && boxesFitLane(sheetLayout(paneRem, LANE), pane.rem);
  const layout = sheetLayout(
    paneRem,
    marginBoxes ? LANE : !scrollMode && noteMarks.length > 0 ? RAIL : 0,
  );
  const inlineAnnotations = scrollMode ? annotationBoxesOpen : !marginBoxes;

  // First-use hint: until dismissed, or until the reader has anything
  const [hintDone, setHintDone] = useState(true);
  useEffect(() => setHintDone(readHintDone()), []);
  const loaded = highlightsLoaded && annotationsApi.loaded && allNotesLoaded;
  const hasStudy =
    highlights.length > 0 || annotationsApi.annotations.length > 0 || allNotes.length > 0;
  function dismissHint() {
    setHintDone(true);
    try {
      localStorage.setItem(HINT_DONE_KEY, "1");
    } catch {
      // storage blocked: hidden for this visit only
    }
  }
  useEffect(() => {
    if (loaded && hasStudy && !hintDone) dismissHint();
  }, [loaded, hasStudy, hintDone]);
  // Not while a load failed: "nothing yet" would be a guess
  const firstUseHint = loaded && !hasStudy && !hintDone && !marksFailed && !allNotesFailed;

  async function addNote(anchor: Parameters<typeof notesApi.add>[0]) {
    const created = await notesApi.add(anchor);
    if (created) setOpenNoteId(created.id);
  }

  /** Bring a reference into view and spotlight it (#210) — one look for
   * every path. Desktop flips to its page (transform cancels out of both
   * rects, so the page math works from any current page); phones scroll it
   * to the upper third of the pane. */
  function jumpToSpot(spot: string) {
    const el = spotEl(spot);
    const target = el ? pageOf(el, stride) : null;
    if (scrollMode && el) scrollToEl(el, "smooth");
    else if (target !== null) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(Math.max(0, Math.min(target, pageCount - 1)));
    }
    setFlash(null); // another reference replaces the verse spotlight
    setSpotId(spot);
    // Phones: the note drawer would cover the spotlit words — fold it down
    if (sideInDrawer) {
      foldedFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setNotePeek(true);
    }
  }

  /** A reference's first word, in this chapter's own text (a page can
   * carry the next chapter too — verse numbers repeat). Null until it can
   * be placed (notes or the versification map still loading). */
  function spotEl(spot: string): Element | null {
    const place = resolveSpot(spot, noteMarks, chapter, localLookup);
    return place ? ((mainRef.current ?? regionRef.current)?.querySelector(spotStartSelector(place)) ?? null) : null;
  }

  /** Desktop page holding an element (transform cancels out of both rects,
   * so this works from any current page); null before measurement. */
  function pageOf(el: Element, pageStride: number): number | null {
    return pageReader(contentRef.current, pageStride)?.(el) ?? null;
  }

  /** Phones: scroll an element to the upper third of the pane. Not
   * scrollIntoView: it would also scroll the locked body. */
  function scrollToEl(el: Element, behavior: ScrollBehavior) {
    const vp = viewportOf();
    if (!vp) return;
    const top = el.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop;
    vp.scrollTo({ top: Math.max(0, top - vp.clientHeight / 3), behavior });
  }

  /** First word of a stored verse. */
  const verseEl = (verse: number) =>
    mainRef.current?.querySelector(`[data-verse="${verse}"][data-word]`) ?? null;

  /** References-table click on a selection: spotlight it (click again to
   * end). Same chapter jumps in place, another chapter navigates with the
   * note kept open and the same spotlight on arrival. */
  function showAnchor(a: NoteAnchor) {
    if (!openNoteId) return;
    const markId = noteMarkId({ noteId: openNoteId, id: a.id });
    if (spotId === markId) {
      setSpotId(null);
      return;
    }
    // Another translation's anchor here is drawn at verse level (#159), at
    // its number in this translation (#163: WEB Mal 4:5 is BPH Mal 3,23)
    const mark = noteMarks.find((m) => noteMarkId(m) === markId);
    const home = a.translationId === chapter.translationId;
    const here = home ? a.book === chapter.book && a.chapter === chapter.chapter : !!mark;
    const there = home
      ? a.chapter
      : (localize?.fromTranslation({ book: a.book, chapter: a.chapter, verse: a.startVerse }, a.translationId)?.ref.chapter ?? a.chapter);
    // A mark in the verses the page before carried (#flow): open the
    // chapter whole, where it is
    if (here && (flowFrom === null || (mark?.startVerse ?? a.startVerse) >= flowFrom)) jumpToSpot(markId);
    else navigate(`/read/${a.book}/${there}?note=${openNoteId}&mark=${encodeURIComponent(markId)}`);
  }

  /** A text reference (#210): its row in the overview (`toggle`: a second
   * click ends it) or a chip's "Show in Bible" — the same spotlight as a
   * selection's, keyed by its canonical href. `at`: where the reading
   * translation has it; "Read in WEB" switches translation on the way. On
   * a phone the drawer folds to its bar, never closes. */
  function readRef(ref: ScriptureRef, at: ScriptureRef, translationId?: string, toggle = false) {
    const spot = openNoteId ? refSpot(openNoteId, ref) : null;
    if (translationId) {
      localStorage.setItem("translationId", translationId);
    } else if (spot) {
      if (toggle && spotId === spot) {
        setSpotId(null);
        return;
      }
      const place = resolveSpot(spot, noteMarks, chapter, localLookup);
      if (place && (flowFrom === null || place.start >= flowFrom)) {
        jumpToSpot(spot);
        return;
      }
    }
    navigate(readHref(at, openNoteId ?? undefined, spot ? spotParam(spot) : undefined));
  }

  /** The overview's location tags (#214): where each reference's spot
   * lands — this page, another page, or (the overview's own call) another
   * chapter. Read at render: a page turn or reflow re-renders the panel. */
  const refLocator: RefLocator = {
    book: chapter.book,
    chapter: chapter.chapter,
    page: scrollMode ? null : page,
    pageOf: (spot) => {
      const place = resolveSpot(spot, noteMarks, chapter, localLookup);
      if (!place || (flowFrom !== null && place.start < flowFrom)) return undefined;
      if (scrollMode) return null;
      const el = stride ? spotEl(spot) : null;
      return (el && pageOf(el, stride)) ?? undefined;
    },
  };

  // Consume ?mark once the chapter's marks are rendered and measured: a
  // selection's id, or a text reference's href (with ?note)
  const wantedMark = searchParams.get("mark");
  useEffect(() => {
    if (!wantedMark || (!scrollMode && stride === 0)) return;
    const spot = spotFromParam(wantedMark, wantedNote);
    const el = spot && spotEl(spot);
    if (!spot || !el) return; // notes or the map still loading — retried when they land
    jumpToSpot(spot);
    setSearchParams(
      (params) => {
        params.delete("mark");
        return params;
      },
      { replace: true, state: flowState },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedMark, stride, scrollMode, noteMarks.length, localize]);


  function closeConnections() {
    localStorage.setItem("connectionsOpen", "0");
    onSideViewChange(null);
  }

  function closeNote() {
    setOpenNoteId(null);
    setSpotId(null);
    if (searchParams.has("note")) {
      setSearchParams(
        (params) => {
          params.delete("note");
          return params;
        },
        { replace: true, state: flowState },
      );
    }
  }

  const chapterKey = `${chapter.translationId}/${chapter.book}.${chapter.chapter}`;

  // Before the measure effect below (same commit): pick up the URL's page
  useLayoutEffect(() => {
    const wanted = parsePageParam(searchParams.get("p"));
    wantedPage.current = wanted;
    wantedVerse.current = null;
    writtenP.current = searchParams.get("p");
    setAnimate(false);
    setPage(wanted === "last" ? 0 : wanted);
    setRovingVerse(null);
    readingPlace.current = null;
    placePage.current = null;
    // The reference spotlight ends with its chapter (#190)
    setFlash(null);
    setSpotId(null);
    // Phones: a new chapter starts at the top
    if (scrollMode) viewportOf()?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey]);

  // Layout effect: measured + resolved before paint, so arriving on page 3
  // (or the last page) never flashes page 1 first
  useLayoutEffect(() => {
    if (!scrollMode) return;
    // One long column: a single "page"; prev/next go straight to chapters
    setPage(0);
    setStride(0);
    setPageCount(1);
  }, [chapterKey, scrollMode, layout.columns, textSize, flowFrom]);
  useMeasure(
    () => [scrollMode ? null : contentRef.current],
    (reason) => {
      const content = contentRef.current;
      if (!content || scrollMode) return;
      // One read phase (late: after the ink's pure reads). The chapter's own
      // pages: the next chapter's opening (#flow) only fills the last one,
      // so it is hidden while the extent is read, and left out of the count
      const spill = spillBoxRef.current;
      if (spill) spill.style.display = "none";
      const gap = parseFloat(getComputedStyle(content).columnGap || "0") || 0;
      const width = content.clientWidth;
      const scrollWidth = content.scrollWidth;
      if (spill) spill.style.display = "";
      if (reason === "fonts") {
        // Webfont swap rewraps the text: the page count changes, and a
        // wanted verse can move to another page without changing the count
        setFontTick((t) => t + 1);
        if (wantedVerse.current !== null) setVerseTick((t) => t + 1);
      }
      if (width === 0) return;
      const nextStride = width + gap;
      setStride(nextStride);
      setPageCount(Math.max(1, Math.ceil((scrollWidth + gap) / nextStride)));
    },
    [chapterKey, scrollMode, layout.columns, textSize, flowFrom],
    { late: true },
  );

  // Verse jump (#53): `?v=` (link, or the jump box — same chapter too).
  // After the chapterKey effect above, which clears any previous target.
  const verseParam = searchParams.get("v");
  useLayoutEffect(() => {
    const range = parseVerseParam(verseParam);
    const target = range && targetVerses(chapter.verses.map((v) => v.verse), range);
    if (!target) return;
    wantedVerse.current = target.start;
    // The jumped-to verses stay lit (#190) — a plain go-to-verse only: a
    // note's reference (?mark) lands here too, then gets the spotlight
    if (!searchParams.has("mark")) {
      setFlash(target);
      setSpotId(null); // replaces a reference's spotlight
    }
    setVerseTick((t) => t + 1);
    if (scrollMode) {
      const el = verseEl(target.start);
      if (el) scrollToEl(el, "auto");
      // Phones have no ?p to normalize to: just drop ?v
      setSearchParams(
        (params) => {
          params.delete("v");
          return params;
        },
        { replace: true, state: flowState },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseParam, chapterKey]);

  useLayoutEffect(() => {
    if (scrollMode || stride === 0) return;
    // A wanted verse picks the page (beats ?p) once its words are laid out
    const verse = wantedVerse.current;
    const el = verse !== null ? verseEl(verse) : null;
    const versePage = el ? pageOf(el, stride) : null;
    if (versePage !== null) wantedPage.current = versePage;
    const wanted = wantedPage.current;
    setPage((p) => resolvePage(wanted ?? p, pageCount));
    setResolvedKey(chapterKey);
  }, [pageCount, stride, chapterKey, scrollMode, verseTick]);

  // The reference spotlight stays until the next click or tap (not a page
  // turn), Escape, chapter change or another reference (#190) — no timer
  useSpotlightEnd(flash !== null || spotId !== null, () => {
    setFlash(null);
    setSpotId(null);
  });
  /** The spotlit verses as the UI writes them ("Joh 3,14–15"). */
  const spotLabel =
    spotPlace &&
    chipLabel(
      {
        book: chapter.book,
        chapter: chapter.chapter,
        verse: spotPlace.start,
        ...(spotPlace.end > spotPlace.start && { endVerse: spotPlace.end }),
      },
      bookLocale(i18n.language),
    );
  /** "Vis alt" (#210): the spotlight ends; focus, which was on the line,
   * goes to the text (phones: the folded note's bar). */
  function endSpot() {
    setFlash(null);
    setSpotId(null);
    requestAnimationFrame(() =>
      (sideInDrawer && notePeek ? peekRef.current : focusText())?.focus({ preventScroll: true }),
    );
  }
  const spotExit = spotLabel
    ? { label: t("reader.spotShowing", { ref: spotLabel }), short: spotLabel, showAll: t("reader.spotShowAll"), onEnd: endSpot }
    : null;

  // Mirror the page into the URL (replace, no history spam) and lastRead
  useEffect(() => {
    if (scrollMode || resolvedKey !== chapterKey) return;
    // Still growing into a wanted page (annotations/webfonts re-measure):
    // don't record the transient clamp
    const wanted = wantedPage.current;
    if (typeof wanted === "number" && wanted !== page) return;
    const want = page > 0 ? String(page + 1) : null;
    // From the live URL: the hook's params lag behind ?mark/?note edits
    const params = new URLSearchParams(window.location.search);
    // Landed on a ?v verse: normalize to its ?p (#53)
    if (writtenP.current !== want || params.has("v")) {
      writtenP.current = want;
      if (want) params.set("p", want);
      else params.delete("p");
      params.delete("v");
      setSearchParams(params, { replace: true, state: flowState });
    }
    try {
      localStorage.setItem("lastRead", lastReadValue(chapter, page));
      notePage(chapter, page); // Recent's "Continue" lands on it too (#142)
    } catch {
      // storage blocked: only the launch page is lost
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, resolvedKey, chapterKey, scrollMode, verseTick]);

  /** ← from the first page opens the previous chapter on its LAST page
   * (#52); phones scroll, so they start the chapter at the top. */
  /** The reader turned the page (keys, arrows) — a focused verse follows to
   * the new page. Any other page change (reflow) turns to the focus instead. */
  const userTurn = useRef(false);

  // Crossing into a chapter is one more page turn: the sheet slides the
  // same way (a view transition, app.css), unless motion is reduced. Driven
  // here, not by the router's viewTransition: the new sheet is captured only
  // once it is laid out on its landing page with its ink (chapterReady
  // below), so it never blinks in after the slide.
  const [sliding, setSliding] = useState(false);
  const turnSeq = useRef(0);
  const readyWait = useRef<{ key: string; resolve: () => void } | null>(null);
  const turnFrom = useRef<{ dir: "prev" | "next"; stride: number; box: Span } | null>(null);
  /** The slide's travel + clip (app.css vars on <html>), from the old text
   * box and the new one (phones: the whole pane, no vars). */
  function setTurnGeometry(newBox: Span | undefined) {
    const root = document.documentElement.style;
    const from = turnFrom.current;
    const sheet = regionRef.current?.parentElement?.getBoundingClientRect();
    if (!from || !newBox || !sheet) {
      for (const v of ["--turn-distance", "--turn-clip-left", "--turn-clip-right"]) root.removeProperty(v);
      return;
    }
    const { distance, clip } = crossingSlide(from.dir, from.stride, from.box, newBox);
    root.setProperty("--turn-distance", `${distance}px`);
    root.setProperty("--turn-clip-left", `${Math.max(0, clip.left - sheet.left)}px`);
    root.setProperty("--turn-clip-right", `${Math.max(0, sheet.right - clip.right)}px`);
  }
  async function crossTo(target: ChapterRef, dir: "prev" | "next", landing?: number | "last", state?: FlowState | null) {
    const href = chapterHref(target, landing);
    const seq = ++turnSeq.current;
    // Going on: the chapter after the target runs on to its last page (#flow)
    // — a short one (a psalm) is all last page, so read it ahead now
    const after = dir === "next" && !scrollMode ? adjacentChapter(target, 1, scheme) : null;
    const runsOnTo = after?.book === target.book ? after : null;
    prefetchNeighbours(chapter.translationId, [runsOnTo], { needed: true });
    // Normally read ahead already; else fetched now, while the page stays live
    await Promise.race([
      Promise.allSettled([warmChapter(chapter.translationId, target), chapterArriving(chapter.translationId, runsOnTo)]),
      wait(CROSS_WAIT_MS),
    ]);
    if (seq !== turnSeq.current) return; // the reader went on meanwhile
    const go = () => navigate(href, { state: state ?? null });
    const slide =
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!slide) {
      go();
      return;
    }
    const root = document.documentElement;
    root.dataset.chapterTurn = dir;
    // Paged: inside the text box, one page stride, like a page turn
    // (crossingSlide). Set for the old box now; the new one refines it once
    // laid out (below), before the slide starts.
    const box = contentBoxRef.current?.getBoundingClientRect();
    turnFrom.current = stride > 0 && box ? { dir, stride, box: { left: box.left, right: box.right } } : null;
    setTurnGeometry(turnFrom.current?.box);
    // Margin ink waits out the slide, as on a page turn (also in the old shot)
    flushSync(() => setSliding(true));
    const key = `${chapter.translationId}/${target.book}.${target.chapter}`;
    const turn = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          const done = () => {
            window.clearTimeout(timer);
            if (readyWait.current?.resolve === done) readyWait.current = null;
            resolve();
          };
          const timer = window.setTimeout(done, CROSS_WAIT_MS);
          readyWait.current = { key, resolve: done };
          go();
        }),
    );
    void turn.finished.finally(() => {
      if (seq !== turnSeq.current) return;
      delete root.dataset.chapterTurn;
      setSliding(false);
    });
  }
  // The crossing's new sheet is ready: on its landing page, marks loaded
  // and measured (all in layout effects, so before this one)
  useLayoutEffect(() => {
    const wanted = readyWait.current;
    if (!wanted || wanted.key !== chapterKey || !loaded) return;
    if (!scrollMode && resolvedKey !== chapterKey) return;
    const box = contentBoxRef.current?.getBoundingClientRect();
    if (turnFrom.current && box && !scrollMode) setTurnGeometry({ left: box.left, right: box.right });
    wanted.resolve();
  });

  function goPrev() {
    userTurn.current = true;
    if (!scrollMode && page > 0) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(page - 1);
    } else if (backTo ?? prevChapter) {
      // Back onto the page we came from: laid out as it was (#flow)
      const back = (backTo ?? prevChapter)!;
      void crossTo(back, "prev", scrollMode ? 0 : "last", flowStarts.get(`${chapter.translationId}/${back.book}.${back.chapter}`) ?? null);
    }
  }

  function goNext() {
    userTurn.current = true;
    if (!scrollMode && page < pageCount - 1) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(page + 1);
    } else if (onward) {
      // On from the verses this page already carried (#flow)
      void crossTo(onward, "next", undefined, onwardState);
    }
  }

  const flowKey = JSON.stringify(flowState);
  useEffect(() => {
    flowStarts.set(chapterKey, flowState);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flowKey stands for flowState
  }, [chapterKey, flowKey]);

  /** "John 4" — localized book names where the UI has them (#52). */
  const refLabel = (r: ChapterRef) =>
    `${nameOf(r.book)} ${r.chapter}`;
  const onFirstPage = scrollMode || page === 0;
  const onLastPage = scrollMode || page >= pageCount - 1;
  /** At a boundary the control says where it goes; inside, it's a page turn. */
  const prevTarget = onFirstPage ? (backTo ?? prevChapter) : null;
  const nextTarget = onLastPage ? onward : null;
  // "World English Bible · Public domain" (#66) — the API's PUBLIC DOMAIN in
  // the UI language; other copyright lines are the publisher's own words
  const copyright = chapter.copyright && /^public domain$/i.test(chapter.copyright.trim())
    ? t("reader.publicDomain")
    : chapter.copyright;
  // The name only where the notice doesn't already say it (NIV's and NKJV's
  // do; BPH's "© 2015 by Biblica" and "Public domain" don't): one wording
  // at every width
  const named = (n: string) => !!chapter.copyright && chapter.copyright.toLowerCase().includes(n.toLowerCase());
  const nameInNotice = named(translationInfo(translation.abbreviation)?.name ?? translation.name) || named(translation.name);
  const credit = [nameInNotice ? null : translation.name, copyright].filter((part): part is string => !!part);
  // The credit leads to the translation's full copyright entry (ToS §7.2);
  // the text's source is cited after it (API.Bible Starter plan)
  const creditLink = {
    href: `/copyright#${encodeURIComponent(translation.abbreviation)}`,
    more: t("copyright.linkFor", { abbr: translation.abbreviation }),
    // The copyright page's Back names it: "Back to John 3"
    from: `${nameOf(chapter.book)} ${chapter.chapter}`,
  };
  const source = chapter.source === "api.bible"
    ? { label: t("copyright.via"), href: API_BIBLE_URL, more: t("copyright.newTab") }
    : undefined;
  /** ":1–11" — the verses on this page (one verse: ":16"); "," in Danish. */
  const verseSpan = pageVerses
    ? `${sep}${pageVerses.first}${pageVerses.last !== pageVerses.first ? `–${pageVerses.last}` : ""}`
    : "";
  /** The last page also carries the next chapter's opening (#flow): the
   * range runs on into it, "2:23–3:4", like a printed running head. */
  const runsOn = !scrollMode && pageVerses && page >= pageCount - 1 ? lastRunOn : null;
  /** "John 3:1–11" (announced), and the bar's bookless "3:1–11" — the book
   * is in the top bar already, like a printed Bible's running head. */
  const shortRange =
    runsOn && pageVerses
      ? `${chapter.chapter}${sep}${pageVerses.first}–${runsOn.ref.chapter}${sep}${runsOn.runOn.toLabel}`
      : `${chapter.chapter}${verseSpan}`;
  const rangeLabel = `${nameOf(chapter.book)} ${shortRange}`;
  /** Every chapter on this spread (#146): the strip marks them all, the
   * address says "Salmerne 23–24". */
  const spreadEnd = runsOn ? runsOn.ref.chapter : null;
  useEffect(() => {
    onSpreadEnd?.(spreadEnd);
  }, [spreadEnd, onSpreadEnd]);

  // Running foot ends: just "‹ Previous" / "Next ›" — crossing into the
  // next chapter is one more page turn (the accessible name says where it
  // lands). Leaving the BOOK is news (#147): "Next: John 1" in words, its
  // name the same. Phones: always chapters, named ("‹ John 2" · "John 4 ›").
  const crossName = (dir: "prev" | "next", target: ChapterRef) =>
    t(scrollMode ? `reader.${dir}ChapterTo` : `reader.${dir}Into`, { ref: refLabel(target) });
  const pagedLabel = (dir: "prev" | "next", target: ChapterRef | null) =>
    target && target.book !== chapter.book ? crossName(dir, target) : t(`reader.${dir}`);
  const prevButton: FootButton = {
    label: scrollMode && prevChapter ? refLabel(prevChapter) : pagedLabel("prev", prevTarget),
    name: prevTarget
      ? crossName("prev", prevTarget)
      : t(scrollMode ? "reader.prevChapter" : "reader.prevPage"),
    hintKey: scrollMode ? "[" : "←",
    keys: scrollMode ? "[" : "ArrowLeft PageUp",
    disabled: onFirstPage && !prevTarget,
    onClick: goPrev,
  };
  const nextButton: FootButton = {
    label: scrollMode && nextChapter ? refLabel(nextChapter) : pagedLabel("next", nextTarget),
    name: nextTarget
      ? crossName("next", nextTarget)
      : t(scrollMode ? "reader.nextChapter" : "reader.nextPage"),
    hintKey: scrollMode ? "]" : "→",
    keys: scrollMode ? "]" : "ArrowRight PageDown",
    disabled: onLastPage && !nextTarget,
    onClick: goNext,
  };

  /** Desktop: jump to a page (Home/End). */
  function goToPage(target: number) {
    if (scrollMode || target === page) return;
    wantedPage.current = null;
    wantedVerse.current = null;
    setAnimate(true);
    setPage(target);
  }

  /** F6 (#65): focus moves between the text and the open side panel. */
  function cycleFocus() {
    const aside = areaRef.current?.querySelector<HTMLElement>("aside");
    const active = document.activeElement;
    if (aside && !aside.contains(active)) {
      const target =
        aside.querySelector<HTMLElement>("[data-panel-focus]") ??
        aside.querySelector<HTMLElement>('[contenteditable="true"]') ??
        aside.querySelector<HTMLElement>("input, button, a[href]");
      target?.focus({ preventScroll: true });
      return;
    }
    const verse = contentRef.current?.querySelector<HTMLElement>(`[${VERSE_FOCUS}][tabindex="0"]`);
    (verse ?? contentRef.current)?.focus({ preventScroll: true });
  }

  // Touch swipe turns the page (tablets in the paged layout). Touch events:
  // nothing scrolls sideways here, so a horizontal flick is ours alone.
  const turnRef = useRef({ goPrev, goNext, toolOn: false });
  turnRef.current = { goPrev, goNext, toolOn: tool.kind !== "select" };
  useEffect(() => {
    const el = paneRef.current;
    if (!el || scrollMode) return;
    let start: { x: number; y: number; at: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      // Not from a box/chip/editor/button — those own their touches
      start =
        e.touches.length === 1 && !target.closest("[data-ink-box], button, a, input, textarea, [contenteditable]")
          ? { x: t.clientX, y: t.clientY, at: Date.now() }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      // A tool's stroke is a drag over words, never a page turn
      if (!s || !t || turnRef.current.toolOn) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy) || Date.now() - s.at > 800) return;
      // A selection being made (its menu is up) is a drag, not a flick
      if (document.querySelector("[role='menu'][data-open]")) return;
      if (dx < 0) turnRef.current.goNext();
      else turnRef.current.goPrev();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [scrollMode]);

  // Wheel and trackpad read on (see wheel-turn.ts): one page per gesture,
  // down/right = next. Nothing in the paged sheet scrolls, so the wheel is
  // free — except over something that scrolls itself (a long margin note),
  // zoom (Ctrl/⌘+wheel), or mid-drag (a selection or a tool's stroke).
  // Not passive: a sideways swipe would otherwise go back in history.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || scrollMode) return;
    const feed = wheelTurner();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.buttons !== 0) return;
      if (scrollsItself(e.target as Element, el, e.deltaX, e.deltaY)) return;
      // An open menu or popover keeps the page still under it
      if (document.querySelector("[role='menu'][data-open]")) return;
      e.preventDefault();
      const turn = feed(e);
      if (turn === "next") turnRef.current.goNext();
      else if (turn === "prev") turnRef.current.goPrev();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollMode]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F6" && !event.altKey && !event.ctrlKey && !event.metaKey && !sideInDrawer) {
        event.preventDefault(); // browser's own F6 = address bar
        cycleFocus();
        return;
      }
      if (ignoreShortcut(event)) return; // typing, modifiers, open modal
      // Esc puts a palette tool down (Select again) — once no menu wants it
      if (event.key === "Escape" && tool.kind !== "select" && !document.querySelector("[role='menu'][data-open]")) {
        setToolPick((p) => ({ ...p, kind: "select" }));
        return;
      }
      // Pen on: 1–5 pick its style (text, box, underline, circle, bracket)
      if (tool.kind === "annotate" && /^[1-5]$/.test(event.key)) {
        setToolPick((p) => ({ ...p, pen: PEN_STYLES[Number(event.key) - 1] }));
        return;
      }
      // Highlighter on: 1–6 pick its colour (the palette's order)
      if (tool.kind === "highlight" && /^[1-6]$/.test(event.key)) {
        setToolPick((p) => ({ ...p, color: HIGHLIGHT_COLORS[Number(event.key) - 1] }));
        return;
      }
      // Chapters (#65): [ / ] — the chapter's start, both ways
      if (event.key === "[" && prevChapter) void crossTo(prevChapter, "prev");
      if (event.key === "]" && nextChapter) void crossTo(nextChapter, "next");
      if (scrollMode) return; // no pages to turn; arrows stay native
      // Palette tools: V puts down; Shift + the menu's own letter picks one
      // (Shift so a stray key never drops the reader into a mode)
      const pick = event.key === "v" && !event.shiftKey ? "select" : TOOL_KEYS[event.key];
      if (pick) {
        event.preventDefault();
        setToolPick((p) => ({ ...p, kind: pick }));
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      }
      if (event.key === "Home" || event.key === "End") {
        userTurn.current = true;
        goToPage(event.key === "Home" ? 0 : pageCount - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Paged reader (#65): focus on a hidden page turns to that page. The sheet
  // is overflow-clipped — the browser's own scroll-into-view would shift it
  // sideways, so that scroll is undone.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode) return;
    const clips = [regionRef.current?.parentElement, contentBoxRef.current].filter(
      (el): el is HTMLElement => !!el,
    );
    const unscroll = () => {
      for (const el of clips) if (el.scrollLeft || el.scrollTop) el.scrollTo(0, 0);
    };
    const onFocusIn = (e: FocusEvent) => {
      unscroll();
      const target = e.target as HTMLElement;
      if (target === content) return;
      const p = pageOf(target, stride);
      if (p !== null && p !== page && p < pageCount) goToPage(p);
    };
    content.addEventListener("focusin", onFocusIn);
    for (const el of clips) el.addEventListener("scroll", unscroll);
    return () => {
      content.removeEventListener("focusin", onFocusIn);
      for (const el of clips) el.removeEventListener("scroll", unscroll);
    };
  });

  // Reading place (#66): the first verse on the page the reader chose. A
  // reflow (panel opened/closed, pane resized, text size, annotations laid
  // in) turns to the page that now holds it instead of keeping the page
  // number. A focused verse wins (#65, below). Also feeds the folio range.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0 || resolvedKey !== chapterKey) return;
    const sig = `${chapterKey}|${stride}|${pageCount}|${layout.columns}|${textSize}|${inlineAnnotations}|${annotationsApi.annotations.length}`;
    const reflow = layoutSig.current.startsWith(`${chapterKey}|`) && sig !== layoutSig.current;
    layoutSig.current = sig;
    const focusedVerse = document.activeElement?.closest?.(`[${VERSE_FOCUS}]`);
    // Arriving backwards (?p=last) holds the LAST page through reflows — the
    // marks loading in widen the lanes and add pages after the first resolve
    const holdLast = wantedPage.current === "last";
    if (reflow && !holdLast && readingPlace.current !== null && wantedVerse.current === null && !focusedVerse) {
      const el = mainRef.current?.querySelector(placeSelector(readingPlace.current));
      const p = reflowPage(el ? pageOf(el, stride) : null, page, pageCount);
      if (p !== null) {
        if (typeof wantedPage.current === "number") wantedPage.current = p;
        restoring.current = true;
        setPage(p);
        return;
      }
    }
    const pageAt = pageReader(content, stride);
    const span = pageSpan(
      Array.from(mainRef.current?.querySelectorAll<HTMLElement>("[data-verse][data-word]") ?? [], (el) => ({
        verse: Number(el.dataset.verse),
        word: Number(el.dataset.word),
        page: pageAt?.(el),
      })),
      page,
    );
    const first = span?.first.verse ?? null;
    const last = span?.lastVerse ?? null;
    setPageVerses((pv) =>
      first === null || last === null
        ? null
        : pv?.first === first && pv.last === last
          ? pv
          : { first, last },
    );
    // A page the reader chose (not our own reflow correction) sets the place:
    // its first verse, or the verse jumped to (?v=) while it is on this page,
    // so switching translation again goes from there (#174: Mal 3,19 → 4:1)
    if (span && first !== null && (readingPlace.current === null || (!reflow && !restoring.current && page !== placePage.current))) {
      const jumped = wantedVerse.current;
      readingPlace.current =
        jumped !== null && last !== null && jumped > first && jumped <= last ? { verse: jumped, word: 0 } : span.first;
    }
    placePage.current = page;
    restoring.current = false;
    if (placeRef) placeRef.current = readingPlace.current?.verse ?? null;
  }, [scrollMode, stride, resolvedKey, chapterKey, pageCount, layout.columns, textSize, inlineAnnotations, annotationsApi.annotations.length, page, placeRef, fontTick]);

  // Off-page controls are inert (no Tab stop on a hidden page); the verse
  // cursor stays on this page, and follows a page turn if it had focus.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0) return;
    const pageAt = pageReader(content, stride);
    for (const el of content.querySelectorAll<HTMLElement>("button, a[href], input, textarea")) {
      const off = pageAt?.(el) !== page;
      if (el.inert !== off) el.inert = off;
    }
  });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0) return;
    const verses = [...(mainRef.current?.querySelectorAll<HTMLElement>(`[${VERSE_FOCUS}]`) ?? [])];
    const pageAt = pageReader(content, stride);
    const onPage = (el: HTMLElement) => pageAt?.(el) === page;
    const byUser = userTurn.current;
    userTurn.current = false;
    const focused = verses.find((el) => el === document.activeElement);
    if (focused && !onPage(focused) && !byUser) {
      // Reflow (panel opened/closed, text size) moved the focused verse
      const p = pageOf(focused, stride);
      if (p !== null) {
        wantedPage.current = null;
        wantedVerse.current = null;
        setPage(Math.min(p, pageCount - 1));
      }
      return;
    }
    const current = verses.find((el) => el.tabIndex === 0);
    if (current && onPage(current)) return;
    const first = verses.find(onPage);
    if (!first) return;
    setRovingVerse(Number(first.getAttribute(VERSE_FOCUS)));
    if (focused) first.focus({ preventScroll: true });
  }, [page, stride, pageCount, scrollMode, chapterKey, layout.columns, textSize, fontTick]);

  /** End of chapter, phones: the attribution right after the last verse
   * (their foot has no credit line). The foot's Next goes on. */
  const chapterEnd = (
    <p className="mt-10 font-sans text-meta text-muted-foreground">
      <CreditParts parts={credit} link={creditLink} source={source} ownLine />
    </p>
  );

  const chapterText = (
    <ChapterText
      chapter={chapter}
      translationAbbreviation={translation.abbreviation}
      language={translation.language}
      heading={heading}
      bookName={nameOf(chapter.book)}
      highlights={highlights}
      annotations={annotationsApi.annotations}
      noteMarks={noteMarks}
      allNotes={allNotes}
      activeAnnotationId={activeAnnotationId}
      spot={spotPlace}
      flash={flash}
      mobile={scrollMode}
      onAddHighlight={add}
      onRecolorHighlight={recolor}
      onRemoveHighlight={remove}
      onAddAnnotation={annotationsApi.add}
      onEditAnnotation={annotationsApi.edit}
      onMarkAnnotation={(id, mark) => void annotationsApi.place(id, { mark })}
      onRemoveAnnotation={annotationsApi.remove}
      onSelectionChange={onSelectionChange}
      rovingVerse={rovingVerse}
      onRovingVerseChange={setRovingVerse}
      inlineAnnotations={inlineAnnotations}
      firstUseHint={firstUseHint}
      onDismissHint={dismissHint}
      onAddNote={(anchor) => void addNote(anchor)}
      onAttachNote={(noteId, anchor) => void notesApi.attach(noteId, anchor)}
      onOpenNote={openNoteAt}
      onFocusAnnotation={setActiveAnnotationId}
      tool={scrollMode ? undefined : tool}
      verses={flowFrom !== null ? { from: flowFrom, to: Number.MAX_SAFE_INTEGER } : undefined}
    />
  );

  /** Anything that moves the words without resizing a box: ink re-measures. */
  const layoutKey = `${stride}:${layout.columns}:${textSize}:${inlineAnnotations}`;

  // A turn hides the pane-fixed margin ink until the slide lands
  useEffect(() => {
    if (!animate) return;
    setTurning(true);
    const timer = window.setTimeout(() => setTurning(false), 300);
    return () => window.clearTimeout(timer);
  }, [page, animate]);

  /** Ink on the words lives in the content box and carries the text's own
   * transform, so a page turn slides every page's ink with its words
   * (marker behind the text, pen in front). Overflow-clipped like the text. */
  const slide = {
    className: cn("absolute inset-0", animate && "transition-transform duration-300 motion-reduce:transition-none"),
    style: { transform: `translateX(-${page * stride}px)` },
  };
  const wordInk = (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div ref={setWashHost} {...slide}>
          <HighlightMarks
            highlights={highlights}
            shown={highlightFilter}
            selection={selection}
            boxRef={contentBoxRef}
            flowRef={contentRef}
            scopeRef={mainRef}
            layoutKey={layoutKey}
            spot={spotPlace}
            open={noteMarks.filter((m) => m.noteId === openNoteId).map((m) => ({ start: m.startVerse, end: m.endVerse }))}
          />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <div ref={setPenHost} {...slide} />
      </div>
    </>
  );

  /** Margin ink (boxes, arrows, note chips) shares the region's box (inset-0). */
  const inkLayers = (
    <div ref={setMarginHost} className="pointer-events-none absolute inset-0">
      <AnnotationMarks
        annotations={annotationsApi.annotations}
        noteMarks={noteMarks}
        flowRef={contentRef}
        scopeRef={mainRef}
        page={scrollMode ? 0 : page}
        stride={scrollMode ? 0 : stride}
        penHost={penHost}
        marginHidden={turning || sliding}
        compact={scrollMode}
        marginBoxes={marginBoxes}
        railChips={!scrollMode}
        regionRef={regionRef}
        contentRef={contentBoxRef}
        layoutKey={layoutKey}
        activeAnnotationId={activeAnnotationId}
        spot={spotPlace}
        openNoteId={openNoteId}
        eraser={!scrollMode && tool.kind === "erase"}
        onFocus={setActiveAnnotationId}
        onEdit={annotationsApi.edit}
        onRemove={annotationsApi.remove}
        onPlace={annotationsApi.place}
        onOpenNote={openNoteAt}
      />
    </div>
  );

  return (
    // Not <main>: SidebarInset already is the page's one main landmark
    <div ref={areaRef} className="flex min-h-0 w-full flex-1 flex-col">
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 w-full flex-1"
        onLayoutChanged={onSplitChange}
      >
      <ResizablePanel
        id="reader"
        minSize="35%"
        defaultSize={openNote ? `${100 - noteSize}%` : "100%"}
        className="flex min-h-0 flex-col"
      >
      <div ref={paneRef} className="relative min-h-0 flex-1">
        {scrollMode ? (
          /* Phone: one ragged-right column, scrolled vertically. The ink
             layers share the region's box, so they scroll with the text. */
          <ScrollArea ref={scrollRef} data-chapter-sheet className="h-full">
            <div ref={regionRef} className="relative isolate">
              <div ref={contentBoxRef} className="relative px-4 pt-8 pb-16">
                {/* Phones: the foot is at the chapter's end — say it up top */}
                <MarksLoadError
                  failed={marksFailed}
                  onRetry={retryMarks}
                  focusAfter={focusText}
                  className="mx-auto mb-4 max-w-[65ch]"
                />
                <div
                  ref={contentRef}
                  id={CHAPTER_TEXT_ID}
                  tabIndex={-1}
                  className="mx-auto max-w-[65ch] touch-manipulation text-left font-serif text-reading leading-[1.6] text-foreground outline-none"
                >
                  {chapterText}
                  {chapterEnd}
                </div>
                {/* The chapter ends with its own foot: on to the next one */}
                <PageFoot
                  label={t("reader.chaptersNav")}
                  position={[]}
                  prev={prevButton}
                  next={nextButton}
                  phone
                  className="mx-auto mt-6 max-w-[65ch]"
                />
                {wordInk}
              </div>
              {inkLayers}
            </div>
          </ScrollArea>
        ) : (
          <>
            {/* The SHEET (#51) always fits the pane: a 2-column spread when
                both columns get a proper measure, else one centred column —
                both paged. Annotation lanes (where untouched boxes start)
                flank the content box only when the chapter has annotations;
                see sheet-layout.ts. Overflow is clipped, never scrolled.
                isolate: local stacking context so the -z-10 ink paints behind
                the text but still above the page background.
                ONLY THE PAGE MOVES on a turn: in a chapter the text column
                (+ its word ink) slides; crossing chapters this whole sheet is
                the sliding layer, so every piece of chrome in it (strip,
                foot, error line) must be a turnStill layer — turn-still.ts.
                Chrome that needs no text-box geometry (tool palette, status
                pill, colour key) lives outside the sheet, below. */}
            <div data-chapter-sheet className="h-full overflow-hidden">
              <div ref={regionRef} className="relative isolate h-full w-full">
                {/* Content box: capped height (34em at body size) centered in
                    the pane, so columns never run tall on big screens. The
                    running foot sits under the text block, as wide as it */}
                <div
                  ref={contentBoxRef}
                  className="relative mx-auto flex h-full flex-col justify-center overflow-hidden px-6 pt-6 pb-6"
                  style={{ width: `${layout.contentWidth}rem` }}
                >
                  {/* Running head: the book's chapters, mirroring the foot
                      (half the air: the chapter numeral brings its own) */}
                  {strip && (
                    <ChapterStrip
                      book={chapter.book}
                      chapter={chapter.chapter}
                      spreadEnd={spreadEnd}
                      scheme={scheme}
                      className="-ml-2 mb-[calc(var(--spacing-sheet-air)/2)] shrink-0"
                    />
                  )}
                  <div
                    ref={contentRef}
                    id={CHAPTER_TEXT_ID}
                    tabIndex={-1}
                    className={cn(
                      "max-h-[34em] min-h-0 flex-1 touch-manipulation text-left font-serif text-reading leading-[1.55] text-foreground outline-none [column-fill:auto] gap-x-14 [.style-clean_&]:leading-[1.6]",
                      layout.columns === 2 ? "columns-2" : "columns-1",
                      tool.kind !== "select" && "[&_[data-word]]:cursor-crosshair",
                      animate && "transition-transform duration-300 motion-reduce:transition-none",
                    )}
                    style={{ transform: `translateX(-${page * stride}px)` }}
                  >
                    <div ref={mainRef}>{chapterText}</div>
                    {/* The next chapter's opening fills this chapter's last
                        page (#flow) — off it (inert) on every other page */}
                    {((chainTexts[0] && sectionShown(0)) || pendingSpill) && stride > 0 && (
                      <div ref={spillBoxRef} data-spill inert={page < pageCount - 1}>
                        {chainTexts.map(
                          (text, i) =>
                            text &&
                            sectionShown(i) && (
                              <div key={`${text.translationId}/${text.book}.${text.chapter}`} ref={sectionRefs[i]} className="mt-[1.6em]">
                                <ChapterSpill
                                  chapter={text}
                                  translationAbbreviation={translation.abbreviation}
                                  language={translation.language}
                                  heading={refLabel(text)}
                                  bookName={nameOf(text.book)}
                                  boxRef={sectionRefs[i]}
                                  lastPage={pageCount - 1}
                                  stride={stride}
                                  pageOf={(el) => pageOf(el, stride)}
                                  layoutKey={layoutKey}
                                  inlineAnnotations={inlineAnnotations}
                                  marginBoxes={marginBoxes}
                                  tool={tool}
                                  shown={highlightFilter}
                                  allNotes={allNotes}
                                  activeAnnotationId={activeAnnotationId}
                                  spotOn={spotPlace !== null}
                                  onFocusAnnotation={setActiveAnnotationId}
                                  onOpenNote={setOpenNoteId}
                                  onRunOn={reportRunOn[i]}
                                  washHost={washHost}
                                  marginHost={marginHost}
                                  penHost={penHost}
                                  regionRef={regionRef}
                                  contentBoxRef={contentBoxRef}
                                  flowRef={contentRef}
                                  page={page}
                                  marginHidden={turning || sliding}
                                />
                              </div>
                            ),
                        )}
                        {pendingSpill && (
                          <SkeletonLines lines={6} numeral limited={pendingSpill.limited} className="mt-[1.6em]" />
                        )}
                      </div>
                    )}
                  </div>
                  {/* No room under the foot: the error line joins the flow */}
                  <div {...turnStill("error-flow")} className="shrink-0">
                    <MarksLoadError
                      failed={marksFailed && errorPlace?.inFlow === true}
                      onRetry={retryMarks}
                      focusAfter={focusText}
                      className="mt-2 text-center"
                    />
                  </div>
                  <PageFoot
                    label={t("reader.pagesNav")}
                    position={[shortRange, t("reader.pageOf", { page: page + 1, count: pageCount })]}
                    credit={credit}
                    creditLink={creditLink}
                    source={source}
                    prev={prevButton}
                    next={nextButton}
                    phone={false}
                    // With the note in a drawer, the line sits on its folded bar
                    spot={sideInDrawer ? null : spotExit}
                    className="chapter-foot mt-sheet-air shrink-0"
                  />
                  {wordInk}
                </div>
                {inkLayers}
                {/* Just under the running foot, in its bottom margin, laid
                    over the page: it never takes room from the columns (the
                    page count and first verse stay put), and spans the pane
                    between the gutters so it stays one line where it can */}
                <div {...turnStill("error-foot")} className="absolute inset-x-reader-gutter z-10" style={{ top: errorPlace?.top ?? 0 }}>
                  {/* Its size, unseen: does it fit under the foot? */}
                  <p ref={errorGhostRef} aria-hidden className="invisible absolute inset-x-0 top-0 min-h-6 text-center text-control text-balance">
                    {t("reader.marksLoadFailed")}
                    {"\u00a0· "}
                    <span className="px-1 font-medium">{t("toast.retry")}</span>
                  </p>
                  <MarksLoadError
                    failed={marksFailed && errorPlace?.inFlow === false}
                    onRetry={retryMarks}
                    focusAfter={focusText}
                    className="text-center"
                  />
                </div>
              </div>
            </div>

            {/* Tool palette in the left gutter (mouse/trackpad only) */}
            <div className="absolute top-0 left-0 z-20 w-reader-gutter">
              <ToolPalette tool={tool} onChange={setToolPick} />
            </div>
            <ToolStatus tool={tool} onDone={() => setToolPick((p) => ({ ...p, kind: "select" }))} />
            {/* Room left of the text (px) for the key: never over the
                words or the foot's Previous (it spills 0.5rem left), nor
                the margin lane — the note chips and annotation boxes live
                there; without room it waits in the gutter */}
            <ColourKey
              room={
                pane.width
                  ? (pane.width - layout.contentWidth * pane.rem) / 2 - layout.lane * pane.rem + PAD * pane.rem - 0.5 * pane.rem - 20
                  : undefined
              }
            />
          </>
        )}
      </div>

      {!scrollMode && (
        <p aria-live="polite" className="sr-only">
          {t("reader.announce", { ref: rangeLabel, page: page + 1, count: pageCount })}
        </p>
      )}
      {/* The spotlight says what it shows, and the way out (#210) */}
      <p role="status" className="sr-only">
        {spotLabel ? t("reader.spotAnnounce", { ref: spotLabel }) : ""}
      </p>
      </ResizablePanel>

      {/* An open note takes the side slot; closing it brings connections back.
          Desktop: resizable side panels. Phone (#13): bottom drawers — the
          same content in its mobile build, app-sheet feel. */}
      {!sideInDrawer && sideView === "connections" && !openNote && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="connections" defaultSize="24%" minSize="16rem" maxSize="40%">
            <ConnectionsPanel
              translationId={chapter.translationId}
              translations={translations}
              book={chapter.book}
              chapter={chapter.chapter}
              onOpenNote={setOpenNoteId}
              onClose={closeConnections}
            />
          </ResizablePanel>
        </>
      )}

      {!sideInDrawer && openNote && (
        <>
          <ResizableHandle withHandle />
          {/* min = what the editor toolbar needs in one row */}
          <ResizablePanel id="note" defaultSize={`${noteSize}%`} minSize="35rem" maxSize="65%">
            <NotePanel
              // One panel per note: no text carries over to the next
              key={openNote.id}
              note={openNote}
              onEdit={notesApi.edit}
              onRemove={notesApi.remove}
              onDetach={notesApi.detach}
              onAttach={notesApi.attach}
              onOpenInNotes={() => navigate(`/notes/${openNote.id}`)}
              onShowAnchor={showAnchor}
              onReadRef={readRef}
              spot={spotId}
              place={chapter}
              locator={refLocator}
              onClose={closeNote}
            />
          </ResizablePanel>
        </>
      )}
      </ResizablePanelGroup>

      {sideInDrawer && (
        <>
          <Drawer
            open={sideView === "connections" && !openNote}
            onOpenChange={(open) => !open && closeConnections()}
            showSwipeHandle
          >
            {/* Content-sized (#62): short lists get a short sheet, capped at 92dvh */}
            <DrawerContent
              aria-label={t("connections.title")}
              className="[--drawer-content-max-height:92dvh]"
            >
              <ConnectionsPanel
                translationId={chapter.translationId}
                translations={translations}
                book={chapter.book}
                chapter={chapter.chapter}
                onOpenNote={setOpenNoteId}
                onClose={closeConnections}
                mobile
              />
            </DrawerContent>
          </Drawer>

          <Drawer
            open={!!openNote}
            onOpenChange={(open) => !open && closeNote()}
            showSwipeHandle
            // Folded (#195): the text is the reader's again — scroll it, tap
            // it (ends the spotlight, #190), the bar stays
            modal={!notePeek}
            disablePointerDismissal={notePeek}
          >
            <DrawerContent
              aria-label={openNote?.title || t("note.untitled")}
              style={{ "--drawer-height": notePeek ? "auto" : "92dvh" } as React.CSSProperties}
            >
              {/* The spotlight's exit line (#210): above the bar, which
                  stays where the thumb found it */}
              {openNote && notePeek && spotExit && (
                <p data-spot-line="" className="mx-3 mt-1 flex min-h-11 min-w-0 items-center gap-1 px-3 text-control text-muted-foreground">
                  <span aria-hidden className="min-w-0 truncate">
                    {spotExit.label}
                  </span>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    data-spot-exit=""
                    data-spot-own=""
                    onClick={spotExit.onEnd}
                    className={cn("-mx-1 inline-flex min-h-11 shrink-0 items-center rounded-sm px-1 font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2", focusRing)}
                  >
                    {spotExit.showAll}
                  </button>
                </p>
              )}
              {openNote && notePeek && (
                <button
                  ref={peekRef}
                  type="button"
                  onClick={unfoldNote}
                  className={cn(
                    "mx-3 mt-1 mb-[max(env(safe-area-inset-bottom),0.75rem)] flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent",
                    focusRing,
                  )}
                >
                  <ChevronUp aria-hidden className="size-4 shrink-0" />
                  <span className="shrink-0 font-medium">{t("note.backToNote")}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{openNote.title || t("note.untitled")}</span>
                </button>
              )}
              {openNote && (
                <div className={cn("flex min-h-0 flex-1 flex-col", notePeek && "hidden")}>
                <NotePanel
                  // One panel per note: no text carries over to the next
                  key={openNote.id}
                  note={openNote}
                  onEdit={notesApi.edit}
                  onRemove={notesApi.remove}
                  onDetach={notesApi.detach}
                  onAttach={notesApi.attach}
                  onOpenInNotes={() => navigate(`/notes/${openNote.id}`)}
                  onShowAnchor={showAnchor}
                  onReadRef={readRef}
                  spot={spotId}
                  place={chapter}
                  locator={refLocator}
                  onClose={closeNote}
                  mobile
                />
                </div>
              )}
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}
