import { useTranslation } from "react-i18next";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS, type Anchor, type Chapter, type HighlightColor, type NoteAnchor, type Translation } from "@biblestdy/shared";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Hint } from "~/components/hint";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { authClient } from "~/lib/auth-client";
import { useBookName } from "~/lib/book-name";
import { useTextSize } from "~/lib/text-size";
import { ignoreShortcut } from "~/lib/shortcuts";
import { cn, focusRing } from "~/lib/utils";
import {
  type ChapterRef,
  chapterHref,
  lastReadValue,
  parsePageParam,
  parseVerseParam,
  resolvePage,
  targetVerses,
  type VerseRange,
  type WantedPage,
} from "./chapter-nav";
import { ChapterText } from "./chapter-text";
import { VERSE_FOCUS } from "./keyboard-selection";
import { ConnectionsPanel } from "./connections-panel";
import { HighlightMarks } from "./highlight-marks";
import { NotePanel } from "./note-panel";
import { boxesFitLane, LANE, RAIL, sheetLayout } from "./sheet-layout";
import { AnnotationMarks } from "./annotation-marks";
import { PALETTE_BOX, PEN_STYLES, ToolPalette, ToolStatus, type PenStyle, type ReaderTool, type ToolKind } from "./tool-palette";
import { noteMarksInChapter, useAllNotesQuery, useNotes, useOtherVersionCounts } from "./use-notes";
import { useHighlights } from "./use-highlights";
import { useAnnotations } from "./use-annotations";

/** The chapter text container: target of the "Skip to text" link (#61). */
export const CHAPTER_TEXT_ID = "chapter-text";

/** Reader area (rem) below which side panels open as drawers: note panel
 * minimum (35rem) + a ~20rem reading column. ~880px at 100%. */
const SIDE_BY_SIDE_MIN = 55;

/** Phones (< sm) read in one scrolling column; wider screens page a spread. */
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

function useScrollMode() {
  const [scroll, setScroll] = useState(
    () => typeof window !== "undefined" && window.matchMedia(SCROLL_MODE_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(SCROLL_MODE_QUERY);
    const onChange = () => setScroll(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return scroll;
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
  heading,
  prevChapter,
  nextChapter,
  sideView,
  onSideViewChange,
  annotationBoxesOpen,
  placeRef,
}: {
  chapter: Chapter;
  translation: Translation;
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
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const nameOf = useBookName();
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
  // The reference selected in the note panel — only its mark stays drawn
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const { highlights, loaded: highlightsLoaded, add, remove, recolor } = useHighlights(
    chapter.translationId,
    chapter.book,
    chapter.chapter,
    chapter,
  );
  const annotationsApi = useAnnotations(chapter.translationId, chapter.book, chapter.chapter, chapter);
  const notesApi = useNotes(chapter.translationId, chapter.book, chapter.chapter);
  const { notes: allNotes, loaded: allNotesLoaded } = useAllNotesQuery(true);
  // The selection being made — its wash is painted with the highlights
  const [selection, setSelection] = useState<Anchor | null>(null);
  const onSelectionChange = useCallback((a: Anchor | null) => setSelection(a), []);
  /** The verse Tab lands on (#65) — kept on the current page. */
  const [rovingVerse, setRovingVerse] = useState<number | null>(null);
  /** Verses with words on the current page (footer range, #66). */
  const [pageVerses, setPageVerses] = useState<{ first: number; last: number } | null>(null);
  /** Reading place across reflows (#66): see the effect near the keys. */
  const readingVerse = useRef<number | null>(null);
  const placePage = useRef<number | null>(null);
  const restoring = useRef(false);
  const layoutSig = useRef("");
  const noteMarks = noteMarksInChapter(
    notesApi.notes,
    chapter.translationId,
    chapter.book,
    chapter.chapter,
  );
  const otherVersionCounts = useOtherVersionCounts(
    chapter.translationId,
    chapter.book,
    chapter.chapter,
  );
  // ?note=<id> keeps the panel open across chapter navigation (references
  // table jumps); ?mark=<mark id> flips to the linked span and flashes it.
  const openNoteId = sideView !== null && sideView !== "connections" ? sideView : null;
  /** Opening a note borrows the side slot; closing falls back to the sticky
   * connections preference. */
  const setOpenNoteId = (id: string | null) =>
    onSideViewChange(
      id ?? (localStorage.getItem("connectionsOpen") === "1" ? "connections" : null),
    );
  // ?note=<id> (cross-chapter reference jump) claims the slot on arrival
  const wantedNote = searchParams.get("note");
  useEffect(() => {
    if (wantedNote) onSideViewChange(wantedNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedNote]);
  // An open note may have no anchor here (opened, then detached from this
  // chapter) — the all-notes list still has it.
  const openNote =
    notesApi.notes.find((f) => f.id === openNoteId) ??
    allNotes.find((f) => f.id === openNoteId) ??
    null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollMode = useScrollMode();
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
  const firstUseHint = loaded && !hasStudy && !hintDone;

  async function addNote(anchor: Parameters<typeof notesApi.add>[0]) {
    const created = await notesApi.add(anchor);
    if (created) setOpenNoteId(created.id);
  }

  /** Bring a note mark into view and select it — every other mark hides
   * until deselected. Desktop flips to its page (transform cancels out of
   * both rects, so the page math works from any current page); phones scroll
   * it to the upper third of the pane. */
  function jumpToMark(markId: string) {
    const el = regionRef.current?.querySelector(
      `[data-annotation-anchor="${CSS.escape(markId)}"]`,
    );
    const target = el ? pageOf(el, stride) : null;
    if (scrollMode && el) scrollToEl(el, "smooth");
    else if (target !== null) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(Math.max(0, Math.min(target, pageCount - 1)));
    }
    setSelectedMarkId(markId);
  }

  /** Desktop page holding an element (transform cancels out of both rects,
   * so this works from any current page); null before measurement. */
  function pageOf(el: Element, pageStride: number): number | null {
    const content = contentRef.current;
    if (!content || pageStride <= 0) return null;
    const contentRect = content.getBoundingClientRect();
    const s = contentRect.width / content.offsetWidth || 1;
    return Math.max(0, Math.floor((el.getBoundingClientRect().left - contentRect.left) / s / pageStride));
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
    contentRef.current?.querySelector(`[data-verse="${verse}"][data-word]`) ?? null;

  /** References-table click: select the reference (click again to deselect).
   * Same chapter jumps in place, another chapter navigates with the note kept
   * open and the mark selected on arrival. */
  function showAnchor(a: NoteAnchor) {
    if (!openNoteId) return;
    const markId = `note:${openNoteId}:${a.id}`;
    if (selectedMarkId === markId) {
      setSelectedMarkId(null);
      return;
    }
    const here =
      a.translationId === chapter.translationId &&
      a.book === chapter.book &&
      a.chapter === chapter.chapter;
    if (here) jumpToMark(markId);
    else navigate(`/read/${a.book}/${a.chapter}?note=${openNoteId}&mark=${markId}`);
  }

  // Consume ?mark once the chapter's marks are rendered and measured.
  const wantedMark = searchParams.get("mark");
  useEffect(() => {
    if (!wantedMark || (!scrollMode && stride === 0)) return;
    const el = regionRef.current?.querySelector(
      `[data-annotation-anchor="${CSS.escape(wantedMark)}"]`,
    );
    if (!el) return; // notes still loading — retried when marks land
    jumpToMark(wantedMark);
    setSearchParams(
      (params) => {
        params.delete("mark");
        return params;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedMark, stride, scrollMode, noteMarks.length]);


  function closeConnections() {
    localStorage.setItem("connectionsOpen", "0");
    onSideViewChange(null);
  }

  function closeNote() {
    setOpenNoteId(null);
    setSelectedMarkId(null);
    if (searchParams.has("note")) {
      setSearchParams(
        (params) => {
          params.delete("note");
          return params;
        },
        { replace: true },
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
    readingVerse.current = null;
    placePage.current = null;
    // Phones: a new chapter starts at the top
    if (scrollMode) viewportOf()?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey]);

  // Layout effect: measured + resolved before paint, so arriving on page 3
  // (or the last page) never flashes page 1 first
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (scrollMode) {
      // One long column: a single "page"; prev/next go straight to chapters
      setPage(0);
      setStride(0);
      setPageCount(1);
      return;
    }
    const measure = () => {
      const gap = parseFloat(getComputedStyle(content).columnGap || "0") || 0;
      const width = content.clientWidth;
      if (width === 0) return;
      const nextStride = width + gap;
      setStride(nextStride);
      setPageCount(Math.max(1, Math.ceil((content.scrollWidth + gap) / nextStride)));
    };
    measure();
    // Webfont swap rewraps the text -> page count changes
    let alive = true;
    // (and can move a wanted verse to another page without changing the count)
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      measure();
      if (wantedVerse.current !== null) setVerseTick((t) => t + 1);
    });
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [chapterKey, scrollMode, layout.columns, textSize]);

  // Verse jump (#53): `?v=` (link, or the jump box — same chapter too).
  // After the chapterKey effect above, which clears any previous target.
  const verseParam = searchParams.get("v");
  useLayoutEffect(() => {
    const range = parseVerseParam(verseParam);
    const target = range && targetVerses(chapter.verses.map((v) => v.verse), range);
    if (!target) return;
    wantedVerse.current = target.start;
    setFlash(target); // a fresh object: a repeat jump flashes again
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
        { replace: true },
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

  // The verse's words glow briefly (CSS .verse-flash). Applied to the DOM:
  // a transient effect, no reason to re-render the chapter text for it.
  useEffect(() => {
    const content = contentRef.current;
    if (!flash || !content) return;
    const words = [...content.querySelectorAll<HTMLElement>("[data-verse][data-word]")].filter(
      (el) => {
        const v = Number(el.dataset.verse);
        return v >= flash.start && v <= flash.end;
      },
    );
    for (const el of words) el.classList.remove("verse-flash");
    void content.offsetWidth; // restart the animation on a repeat jump
    for (const el of words) el.classList.add("verse-flash");
    const timer = window.setTimeout(() => {
      for (const el of words) el.classList.remove("verse-flash");
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      for (const el of words) el.classList.remove("verse-flash");
    };
  }, [flash, chapterKey]);

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
      setSearchParams(params, { replace: true });
    }
    try {
      localStorage.setItem("lastRead", lastReadValue(chapter, page));
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

  function goPrev() {
    userTurn.current = true;
    if (!scrollMode && page > 0) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(page - 1);
    } else if (prevChapter) navigate(chapterHref(prevChapter, scrollMode ? 0 : "last"));
  }

  function goNext() {
    userTurn.current = true;
    if (!scrollMode && page < pageCount - 1) {
      wantedPage.current = null;
      wantedVerse.current = null;
      setAnimate(true);
      setPage(page + 1);
    } else if (nextChapter) navigate(chapterHref(nextChapter));
  }

  /** "John 4" — localized book names where the UI has them (#52). */
  const refLabel = (r: ChapterRef) =>
    `${nameOf(r.book)} ${r.chapter}`;
  const hereLabel = refLabel(chapter);
  const onFirstPage = scrollMode || page === 0;
  const onLastPage = scrollMode || page >= pageCount - 1;
  /** At a boundary the control says where it goes; inside, it's a page turn. */
  const prevTarget = onFirstPage ? prevChapter : null;
  const nextTarget = onLastPage ? nextChapter : null;
  // "World English Bible · Public domain" (#66) — the API's PUBLIC DOMAIN in
  // the UI language; other copyright lines are the publisher's own words
  const copyright = chapter.copyright && /^public domain$/i.test(chapter.copyright.trim())
    ? t("reader.publicDomain")
    : chapter.copyright;
  const attribution = [translation.name, copyright].filter(Boolean).join(" · ");
  /** "John 3:1–11" — the verses on this page (one verse: "John 3:16"). */
  const rangeLabel = pageVerses
    ? `${hereLabel}:${pageVerses.first}${pageVerses.last !== pageVerses.first ? `–${pageVerses.last}` : ""}`
    : hereLabel;

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
      // Chapters (#65): [ / ] — the chapter's start, both ways
      if (event.key === "[" && prevChapter) navigate(chapterHref(prevChapter));
      if (event.key === "]" && nextChapter) navigate(chapterHref(nextChapter));
      if (scrollMode) return; // no pages to turn; arrows stay native
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
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
  // number. A focused verse wins (#65, below). Also feeds the footer range.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0 || resolvedKey !== chapterKey) return;
    const sig = `${chapterKey}|${stride}|${pageCount}|${layout.columns}|${textSize}|${inlineAnnotations}|${annotationsApi.annotations.length}`;
    const reflow = layoutSig.current.startsWith(`${chapterKey}|`) && sig !== layoutSig.current;
    layoutSig.current = sig;
    const focusedVerse = document.activeElement?.closest?.(`[${VERSE_FOCUS}]`);
    if (reflow && readingVerse.current !== null && wantedVerse.current === null && !focusedVerse) {
      const el = verseEl(readingVerse.current);
      const target = el ? pageOf(el, stride) : null;
      if (target !== null && target !== page) {
        const p = Math.min(target, pageCount - 1);
        if (typeof wantedPage.current === "number") wantedPage.current = p;
        restoring.current = true;
        setPage(p);
        return;
      }
    }
    let first: number | null = null;
    let last: number | null = null;
    for (const el of content.querySelectorAll<HTMLElement>("[data-verse][data-word]")) {
      if (pageOf(el, stride) !== page) continue;
      const v = Number(el.dataset.verse);
      if (first === null) first = v;
      last = v;
    }
    setPageVerses((pv) =>
      first === null || last === null
        ? null
        : pv?.first === first && pv.last === last
          ? pv
          : { first, last },
    );
    // A page the reader chose (not our own reflow correction) sets the place
    if (first !== null && (readingVerse.current === null || (!reflow && !restoring.current && page !== placePage.current)))
      readingVerse.current = first;
    placePage.current = page;
    restoring.current = false;
    if (placeRef) placeRef.current = readingVerse.current;
  }, [scrollMode, stride, resolvedKey, chapterKey, pageCount, layout.columns, textSize, inlineAnnotations, annotationsApi.annotations.length, page, placeRef]);

  // Off-page controls are inert (no Tab stop on a hidden page); the verse
  // cursor stays on this page, and follows a page turn if it had focus.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0) return;
    for (const el of content.querySelectorAll<HTMLElement>("button, a[href], input, textarea")) {
      const off = pageOf(el, stride) !== page;
      if (el.inert !== off) el.inert = off;
    }
  });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || scrollMode || stride === 0) return;
    const verses = [...content.querySelectorAll<HTMLElement>(`[${VERSE_FOCUS}]`)];
    const onPage = (el: HTMLElement) => pageOf(el, stride) === page;
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
  }, [page, stride, pageCount, scrollMode, chapterKey, layout.columns, textSize]);

  /** End of chapter (#52): flows right after the last verse — the last page
   * on desktop, the end of the scroll on phones (which also carry the
   * attribution here, their footer being just the arrows). */
  const chapterEnd = (
    <div className="mt-10 flex break-inside-avoid flex-col items-start gap-4 font-sans">
      {nextChapter && (
        <Link
          to={chapterHref(nextChapter)}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
        >
          {t("reader.continueTo", { ref: refLabel(nextChapter) })}
          <ArrowRight data-icon="inline-end" />
        </Link>
      )}
      {scrollMode && <p className="text-meta text-muted-foreground">{attribution}</p>}
    </div>
  );

  const chapterText = (
    <ChapterText
      chapter={chapter}
      translationAbbreviation={translation.abbreviation}
      heading={heading}
      highlights={highlights}
      annotations={annotationsApi.annotations}
      noteMarks={noteMarks}
      allNotes={allNotes}
      otherVersionCounts={otherVersionCounts}
      activeAnnotationId={activeAnnotationId}
      selectedMarkId={selectedMarkId}
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
      onOpenNote={setOpenNoteId}
      onFocusAnnotation={setActiveAnnotationId}
      tool={scrollMode ? undefined : tool}
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
        <div {...slide}>
          <HighlightMarks
            highlights={highlights}
            selection={selection}
            boxRef={contentBoxRef}
            flowRef={contentRef}
            layoutKey={layoutKey}
            hidden={
              selectedMarkId != null &&
              noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId)
            }
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
    <div className="pointer-events-none absolute inset-0">
      <AnnotationMarks
        annotations={annotationsApi.annotations}
        noteMarks={noteMarks}
        flowRef={contentRef}
        page={scrollMode ? 0 : page}
        stride={scrollMode ? 0 : stride}
        penHost={penHost}
        marginHidden={turning}
        compact={scrollMode}
        marginBoxes={marginBoxes}
        railChips={!scrollMode}
        regionRef={regionRef}
        contentRef={contentBoxRef}
        layoutKey={layoutKey}
        activeAnnotationId={activeAnnotationId}
        selectedMarkId={selectedMarkId}
        onFocus={setActiveAnnotationId}
        onEdit={annotationsApi.edit}
        onRemove={annotationsApi.remove}
        onPlace={annotationsApi.place}
        onOpenNote={setOpenNoteId}
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
      {/* Any press in the reader cancels the reference spotlight (a mouse
          nicety; keyboard users clear it from the note's references).
          Pointer-up: word presses stop it there (chapter-text.tsx) */}
      <div
        ref={paneRef}
        role="presentation"
        className="relative min-h-0 flex-1"
        onPointerUp={() => selectedMarkId && setSelectedMarkId(null)}
      >
        {scrollMode ? (
          /* Phone: one ragged-right column, scrolled vertically. The ink
             layers share the region's box, so they scroll with the text. */
          <ScrollArea ref={scrollRef} className="h-full">
            <div ref={regionRef} className="relative isolate">
              <div ref={contentBoxRef} className="relative px-4 pt-8 pb-16">
                <div
                  ref={contentRef}
                  id={CHAPTER_TEXT_ID}
                  tabIndex={-1}
                  className="mx-auto max-w-[65ch] touch-manipulation text-left font-serif text-reading leading-[1.6] text-foreground outline-none"
                >
                  {chapterText}
                  {chapterEnd}
                </div>
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
                the text but still above the page background */}
            <div className="h-full overflow-hidden">
              <div ref={regionRef} className="relative isolate h-full w-full">
                {/* Content box: capped height (34em at body size) centered in
                    the pane, so columns never run tall on big screens */}
                <div
                  ref={contentBoxRef}
                  className="relative mx-auto flex h-full flex-col justify-center overflow-hidden px-6 pt-6 pb-6"
                  style={{ width: `${layout.contentWidth}rem` }}
                >
                  <div
                    ref={contentRef}
                    id={CHAPTER_TEXT_ID}
                    tabIndex={-1}
                    className={cn(
                      "h-full max-h-[34em] touch-manipulation text-left font-serif text-reading leading-[1.55] text-foreground outline-none [column-fill:auto] gap-x-14 [.style-clean_&]:leading-[1.6]",
                      layout.columns === 2 ? "columns-2" : "columns-1",
                      tool.kind !== "select" && "[&_[data-word]]:cursor-crosshair",
                      animate && "transition-transform duration-300 motion-reduce:transition-none",
                    )}
                    style={{ transform: `translateX(-${page * stride}px)` }}
                  >
                    {chapterText}
                    {chapterEnd}
                  </div>
                  {wordInk}
                </div>
                {inkLayers}
              </div>
            </div>

            {/* Page turns on the page (not the footer): a full-height strip at
                each pane edge with a visible arrow — click/tap anywhere on it.
                At a chapter boundary it names where it goes. */}
            <div className="absolute inset-y-0 left-0 z-20 flex w-12 flex-col">
              <ToolPalette tool={tool} onChange={setToolPick} />
              <PageTurn
                dir="prev"
                target={prevTarget ? refLabel(prevTarget) : null}
                hidden={onFirstPage && !prevChapter}
                onClick={goPrev}
              />
            </div>
            <div className="absolute inset-y-0 right-0 z-20 flex w-12 flex-col">
              <div aria-hidden className={cn(PALETTE_BOX, "pointer-events-none pointer-coarse:hidden")} />
              <PageTurn
                dir="next"
                target={nextTarget ? refLabel(nextTarget) : null}
                hidden={onLastPage && !nextChapter}
                onClick={goNext}
              />
            </div>
            <ToolStatus tool={tool} onDone={() => setToolPick((p) => ({ ...p, kind: "select" }))} />
          </>
        )}
      </div>

      {/* One footer line (#52, #66), aligned to the text measure:
          "World English Bible · Public domain" ··· "‹ John 2 · John 3:1–11 · 1/4 · John 4 ›".
          At a chapter boundary an arrow says where it goes; the top running
          head is gone. Phones scroll, so their buttons always step chapters. */}
      <footer
        className="mx-auto flex w-full shrink-0 items-center justify-between gap-4 border-t border-border px-2 py-2 text-meta text-muted-foreground sm:px-6"
        style={scrollMode ? undefined : { maxWidth: `${Math.max(layout.contentWidth, 30)}rem` }}
      >
        {!scrollMode && <span className="min-w-0 flex-1 truncate">{attribution}</span>}
        {scrollMode ? (
          // Phones scroll the chapter: these step chapters, not pages
          <span className="flex shrink-0 items-center gap-1">
            <NavButton
              dir="prev"
              target={prevChapter ? refLabel(prevChapter) : null}
              disabled={!prevChapter}
              onClick={goPrev}
            />
            <NavButton
              dir="next"
              target={nextChapter ? refLabel(nextChapter) : null}
              disabled={!nextChapter}
              onClick={goNext}
            />
          </span>
        ) : (
          <span aria-hidden className="flex shrink-0 items-center gap-1.5 whitespace-nowrap tabular-nums">
            <span>{rangeLabel}</span>
            <span>·</span>
            <span>
              {page + 1}/{pageCount}
            </span>
          </span>
        )}
        {!scrollMode && (
          <p aria-live="polite" className="sr-only">
            {t("reader.announce", { ref: rangeLabel, page: page + 1, count: pageCount })}
          </p>
        )}
      </footer>
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
              note={openNote}
              onEdit={notesApi.edit}
              onRemove={notesApi.remove}
              onDetach={notesApi.detach}
              onShowAnchor={showAnchor}
              selectedAnchorId={selectedMarkId?.split(":")[2] ?? null}
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
                book={chapter.book}
                chapter={chapter.chapter}
                onOpenNote={setOpenNoteId}
                onClose={closeConnections}
                mobile
              />
            </DrawerContent>
          </Drawer>

          <Drawer open={!!openNote} onOpenChange={(open) => !open && closeNote()} showSwipeHandle>
            <DrawerContent
              aria-label={openNote?.title || t("note.untitled")}
              style={{ "--drawer-height": "92dvh" } as React.CSSProperties}
            >
              {openNote && (
                <NotePanel
                  note={openNote}
                  onEdit={notesApi.edit}
                  onRemove={notesApi.remove}
                  onDetach={notesApi.detach}
                  onShowAnchor={showAnchor}
                  selectedAnchorId={selectedMarkId?.split(":")[2] ?? null}
                  onClose={closeNote}
                  mobile
                />
              )}
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}

/** Page-turn strip (desktop/tablet): the whole strip is the button; the
 * arrow sits in a visible circle. Crossing into another chapter, the strip
 * also prints it ("John 4", set vertically like a book's running head). */
function PageTurn({
  dir,
  target,
  hidden,
  onClick,
}: {
  dir: "prev" | "next";
  /** "John 4" when this press changes chapter; null = page turn. */
  target: string | null;
  /** Nothing that way (Genesis 1's first page, Revelation 22's last). */
  hidden: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (hidden) return null;
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = target
    ? t(dir === "prev" ? "reader.prevChapterTo" : "reader.nextChapterTo", { ref: target })
    : t(dir === "prev" ? "reader.prevPage" : "reader.nextPage");
  const shortcut = target ? (dir === "prev" ? "[" : "]") : dir === "prev" ? "←" : "→";
  return (
    <Hint label={label} shortcut={shortcut} side={dir === "prev" ? "right" : "left"}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "group relative flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/[0.03] hover:text-foreground",
          "outline-none",
        )}
      >
        {/* Focus shows on the circle, not as a full-height frame */}
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background shadow-xs transition-colors group-hover:border-foreground/25 group-focus-visible:ring-3 group-focus-visible:ring-ring/50 group-active:scale-95">
          <Icon className="size-5" aria-hidden />
        </span>
        {target && (
          // Under the arrow (absolute: the arrow stays level with the other
          // strip's), horizontal and wrapping — "John 4" reads without a head tilt
          <span
            aria-hidden
            className="absolute top-[calc(50%+1.5rem)] inset-x-0.5 text-center text-list leading-tight font-medium break-words"
          >
            {target}
          </span>
        )}
      </button>
    </Hint>
  );
}

/** Footer arrow (phones): icon-only page turn (tooltip names the key), or labelled
 * with the chapter it opens when it crosses one. */
function NavButton({
  dir,
  target,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  /** "John 4" when this press changes chapter; null = page turn. */
  target: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = target
    ? t(dir === "prev" ? "reader.prevChapterTo" : "reader.nextChapterTo", { ref: target })
    : t(dir === "prev" ? "reader.prevPage" : "reader.nextPage");
  // A page turn names its arrow key; a chapter step its bracket (#65)
  const shortcut = target ? (dir === "prev" ? "[" : "]") : dir === "prev" ? "←" : "→";
  return (
    <Hint label={label} shortcut={shortcut} side="top">
      <Button
        variant="ghost"
        size={target ? "sm" : "icon-sm"}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        {dir === "prev" && <Icon data-icon={target ? "inline-start" : undefined} />}
        {target}
        {dir === "next" && <Icon data-icon={target ? "inline-end" : undefined} />}
      </Button>
    </Hint>
  );
}
