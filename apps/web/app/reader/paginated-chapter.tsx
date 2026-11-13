import { useTranslation } from "react-i18next";
import type { Chapter, NoteAnchor, Translation } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { ignoreShortcut } from "~/lib/shortcuts";
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
  prevHref,
  nextHref,
  sideView,
  onSideViewChange,
  annotationBoxesOpen,
}: {
  chapter: Chapter;
  translation: Translation;
  heading: string;
  prevHref: string | null;
  nextHref: string | null;
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
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [stride, setStride] = useState(0);
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    setPage(0);
    // Phones: a new chapter starts at the top
    if (scrollMode) viewportOf()?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey]);

  useEffect(() => {
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

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  function goPrev() {
    if (page > 0) setPage(page - 1);
    else if (prevHref) navigate(prevHref);
  }

  function goNext() {
    if (page < pageCount - 1) setPage(page + 1);
    else if (nextHref) navigate(nextHref);
  }

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
                  <div
                    ref={contentRef}
                    className={`h-full max-h-[34em] text-left font-serif text-lg leading-[1.55] text-foreground/95 transition-transform duration-300 [column-fill:auto] gap-x-14 [.style-clean_&]:leading-[1.6] ${
                      layout.columns === 2 ? "columns-2" : "columns-1"
                    }`}
                    style={{ transform: `translateX(-${page * stride}px)` }}
                  >
                    {chapterText}
                  </div>
                </div>
                {inkLayers}
              </div>
            </div>

            {/* Page-flip zones, pinned to the pane edges */}
            <button
              type="button"
              aria-label={t("reader.prevPage")}
              onClick={goPrev}
              className="absolute inset-y-0 left-0 z-20 flex w-8 items-center justify-center text-muted-foreground/50 transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t("reader.nextPage")}
              onClick={goNext}
              className="absolute inset-y-0 right-0 z-20 flex w-8 items-center justify-center text-muted-foreground/50 transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      <footer className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-t border-border px-4 py-3 font-mono text-[0.65rem] text-muted-foreground sm:px-6">
        <span className="truncate">
          {chapter.book}.{chapter.chapter} · {t("reader.verses", { count: chapter.verses.length })} ·{" "}
          {translation.abbreviation}
          {chapter.copyright ? ` · ${chapter.copyright}` : ""}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {!scrollMode && (
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1">←</kbd>
              <kbd className="rounded border border-border bg-muted px-1">→</kbd>
            </span>
          )}
          {/* Phones have no pages: the buttons step chapters */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(scrollMode ? "reader.prevChapter" : "reader.prevPage")}
            onClick={goPrev}
            disabled={page === 0 && !prevHref}
          >
            <ChevronLeft />
          </Button>
          {!scrollMode && (
            <span className="tabular-nums">
              p. {page + 1}/{pageCount}
            </span>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t(scrollMode ? "reader.nextChapter" : "reader.nextPage")}
            onClick={goNext}
            disabled={page >= pageCount - 1 && !nextHref}
          >
            <ChevronRight />
          </Button>
        </span>
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
