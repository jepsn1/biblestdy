import { useTranslation } from "react-i18next";
import type { Chapter, NoteAnchor, Translation } from "@biblestdy/shared";
import { getBook } from "@biblestdy/shared";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { ignoreShortcut } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import {
  type ChapterRef,
  chapterHref,
  lastReadValue,
  parsePageParam,
  resolvePage,
  type WantedPage,
} from "./chapter-nav";
import { ChapterText } from "./chapter-text";
import { ConnectionsPanel } from "./connections-panel";
import { HighlightMarks } from "./highlight-marks";
import { NotePanel } from "./note-panel";
import { sheetLayout } from "./sheet-layout";
import { AnnotationMarks } from "./annotation-marks";
import { noteMarksInChapter, useAllNotes, useNotes, useOtherVersionCounts } from "./use-notes";
import { useHighlights } from "./use-highlights";
import { useAnnotations } from "./use-annotations";

/** Phones (< sm) read in one scrolling column; wider screens page a spread. */
const SCROLL_MODE_QUERY = "(max-width: 639.98px)";

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
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Page kept in the URL (#52): `?p=N` (1-based) or `?p=last` (arriving
  // backwards). The wanted page holds until the reader turns a page, so a
  // webfont re-measure still lands on it; null = the reader took over.
  const wantedPage = useRef<WantedPage | null>(null);
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
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  // The reference selected in the note panel — only its mark stays drawn
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const { highlights, add, remove } = useHighlights(
    chapter.translationId,
    chapter.book,
    chapter.chapter,
  );
  const annotationsApi = useAnnotations(chapter.translationId, chapter.book, chapter.chapter);
  const notesApi = useNotes(chapter.translationId, chapter.book, chapter.chapter);
  const allNotes = useAllNotes(true);
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
  }, [scrollMode]);
  const hasLanes = annotationsApi.annotations.length > 0;
  // Unmeasured (first paint): assume a roomy pane; the layout effect corrects
  // it before the browser paints.
  const layout = sheetLayout(pane.width ? pane.width / pane.rem : 120, hasLanes);

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
    const content = contentRef.current;
    const vp = viewportOf();
    if (scrollMode && el && vp) {
      // Not scrollIntoView: it would also scroll the locked body
      const top =
        el.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop;
      vp.scrollTo({ top: Math.max(0, top - vp.clientHeight / 3), behavior: "smooth" });
    } else if (el && content && stride > 0) {
      const contentRect = content.getBoundingClientRect();
      const s = contentRect.width / content.offsetWidth || 1;
      const target = Math.floor(
        (el.getBoundingClientRect().left - contentRect.left) / s / stride,
      );
      wantedPage.current = null;
      setAnimate(true);
      setPage(Math.max(0, Math.min(target, pageCount - 1)));
    }
    setSelectedMarkId(markId);
  }

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
    setAnimate(false);
    setPage(wanted === "last" ? 0 : wanted);
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
    void document.fonts?.ready.then(() => alive && measure());
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [chapterKey, scrollMode, layout.columns]);

  useLayoutEffect(() => {
    if (scrollMode || stride === 0) return;
    const wanted = wantedPage.current;
    setPage((p) => resolvePage(wanted ?? p, pageCount));
    setResolvedKey(chapterKey);
  }, [pageCount, stride, chapterKey, scrollMode]);

  // Mirror the page into the URL (replace, no history spam) and lastRead
  useEffect(() => {
    if (scrollMode || resolvedKey !== chapterKey) return;
    const want = page > 0 ? String(page + 1) : null;
    if (searchParams.get("p") !== want) {
      setSearchParams(
        (params) => {
          if (want) params.set("p", want);
          else params.delete("p");
          return params;
        },
        { replace: true },
      );
    }
    try {
      localStorage.setItem("lastRead", lastReadValue(chapter, page));
    } catch {
      // storage blocked: only the launch page is lost
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, resolvedKey, chapterKey, scrollMode]);

  /** ← from the first page opens the previous chapter on its LAST page
   * (#52); phones scroll, so they start the chapter at the top. */
  function goPrev() {
    if (!scrollMode && page > 0) {
      wantedPage.current = null;
      setAnimate(true);
      setPage(page - 1);
    } else if (prevChapter) navigate(chapterHref(prevChapter, scrollMode ? 0 : "last"));
  }

  function goNext() {
    if (!scrollMode && page < pageCount - 1) {
      wantedPage.current = null;
      setAnimate(true);
      setPage(page + 1);
    } else if (nextChapter) navigate(chapterHref(nextChapter));
  }

  /** "John 4" — localized book names where the UI has them (#52). */
  const refLabel = (r: ChapterRef) =>
    `${t(`books.${r.book}`, { defaultValue: getBook(r.book)?.name ?? r.book })} ${r.chapter}`;
  const hereLabel = refLabel(chapter);
  const onFirstPage = scrollMode || page === 0;
  const onLastPage = scrollMode || page >= pageCount - 1;
  /** At a boundary the control says where it goes; inside, it's a page turn. */
  const prevTarget = onFirstPage ? prevChapter : null;
  const nextTarget = onLastPage ? nextChapter : null;
  const attribution = [hereLabel, translation.name, chapter.copyright].filter(Boolean).join(" · ");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (scrollMode) return; // no pages to turn; arrows stay native
      if (ignoreShortcut(event)) return; // typing, modifiers, open modal
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      {scrollMode && <p className="text-xs text-muted-foreground">{attribution}</p>}
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
      onRemoveHighlight={remove}
      onAddAnnotation={annotationsApi.add}
      onAddNote={(anchor) => void addNote(anchor)}
      onAttachNote={(noteId, anchor) => void notesApi.attach(noteId, anchor)}
      onOpenNote={setOpenNoteId}
      onFocusAnnotation={setActiveAnnotationId}
    />
  );

  /** Ink layers share the region's box (inset-0); measured from word spans. */
  const inkLayers = (
    <div className="pointer-events-none absolute inset-0">
      <HighlightMarks
        highlights={highlights}
        regionRef={regionRef}
        contentRef={contentBoxRef}
        page={page}
        hidden={
          selectedMarkId != null &&
          noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId)
        }
      />

      {/* After HighlightMarks: same underlay stratum, so pen arrows paint over marker */}
      <AnnotationMarks
        annotations={annotationsApi.annotations}
        noteMarks={noteMarks}
        compact={scrollMode}
        showBoxes={annotationBoxesOpen}
        regionRef={regionRef}
        contentRef={contentBoxRef}
        page={page}
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
    <main className="flex min-h-0 w-full flex-1 flex-col">
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
      {/* Any click in the reader cancels the reference spotlight */}
      <div
        ref={paneRef}
        className="relative min-h-0 flex-1"
        onClick={() => selectedMarkId && setSelectedMarkId(null)}
      >
        {scrollMode ? (
          /* Phone: one ragged-right column, scrolled vertically. The ink
             layers share the region's box, so they scroll with the text. */
          <ScrollArea ref={scrollRef} className="h-full">
            <div ref={regionRef} className="relative isolate">
              <div ref={contentBoxRef} className="relative px-4 pt-8 pb-16">
                <div
                  ref={contentRef}
                  className="mx-auto max-w-[65ch] text-left font-serif text-lg leading-[1.6] text-foreground/95"
                >
                  {chapterText}
                  {chapterEnd}
                </div>
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
                  className="relative mx-auto flex h-full flex-col justify-center overflow-hidden px-6 pt-8 pb-6"
                  style={{ width: `${layout.contentWidth}rem` }}
                >
                  {/* Running head (#52) in the box's top padding — absolute,
                      so the text (and the ink measured from it) never moves.
                      Screen readers get the live region instead. */}
                  <p
                    aria-hidden
                    className="pointer-events-none absolute inset-x-6 top-2 truncate text-center font-sans text-[0.7rem] tabular-nums text-muted-foreground"
                  >
                    {t("reader.runningHead", { ref: hereLabel, page: page + 1, count: pageCount })}
                  </p>
                  <div
                    ref={contentRef}
                    className={cn(
                      "h-full max-h-[34em] text-left font-serif text-lg leading-[1.55] text-foreground/95 [column-fill:auto] gap-x-14 [.style-clean_&]:leading-[1.6]",
                      layout.columns === 2 ? "columns-2" : "columns-1",
                      animate && "transition-transform duration-300 motion-reduce:transition-none",
                    )}
                    style={{ transform: `translateX(-${page * stride}px)` }}
                  >
                    {chapterText}
                    {chapterEnd}
                  </div>
                </div>
                {inkLayers}
              </div>
            </div>

          </>
        )}
      </div>

      {/* One control set (#52): quiet ‹ 1 / 3 › — at a chapter boundary the
          arrow says where it goes ("‹ John 2" / "John 4 ›"). Phones scroll,
          so their buttons always step chapters, labelled the same way. */}
      <footer className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-t border-border px-2 py-2 text-xs text-muted-foreground sm:px-6">
        {!scrollMode && <span className="min-w-0 flex-1 truncate">{attribution}</span>}
        <NavButton
          dir="prev"
          target={prevTarget ? refLabel(prevTarget) : null}
          disabled={onFirstPage && !prevChapter}
          onClick={goPrev}
        />
        {!scrollMode && (
          <span aria-hidden className="-mx-2 min-w-[3rem] text-center tabular-nums">
            {page + 1} / {pageCount}
          </span>
        )}
        <NavButton
          dir="next"
          target={nextTarget ? refLabel(nextTarget) : null}
          disabled={onLastPage && !nextChapter}
          onClick={goNext}
        />
        {!scrollMode && (
          <p aria-live="polite" className="sr-only">
            {t("reader.announce", { ref: hereLabel, page: page + 1, count: pageCount })}
          </p>
        )}
      </footer>
      </ResizablePanel>

      {/* An open note takes the side slot; closing it brings connections back.
          Desktop: resizable side panels. Phone (#13): bottom drawers — the
          same content in its mobile build, app-sheet feel. */}
      {!scrollMode && sideView === "connections" && !openNote && (
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

      {!scrollMode && openNote && (
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

      {scrollMode && (
        <>
          <Drawer
            open={sideView === "connections" && !openNote}
            onOpenChange={(open) => !open && closeConnections()}
            showSwipeHandle
          >
            <DrawerContent style={{ "--drawer-height": "70dvh" } as React.CSSProperties}>
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
            <DrawerContent style={{ "--drawer-height": "92dvh" } as React.CSSProperties}>
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
    </main>
  );
}

/** Footer arrow: icon-only page turn (tooltip names the key), or labelled
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
  const hint = target ? label : t(dir === "prev" ? "reader.prevPageHint" : "reader.nextPageHint");
  return (
    <Button
      variant="ghost"
      size={target ? "sm" : "icon-sm"}
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {dir === "prev" && <Icon data-icon={target ? "inline-start" : undefined} />}
      {target}
      {dir === "next" && <Icon data-icon={target ? "inline-end" : undefined} />}
    </Button>
  );
}
