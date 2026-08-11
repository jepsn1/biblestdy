import { useTranslation } from "react-i18next";
import type { Chapter, NoteAnchor, Translation } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { ChapterText } from "./chapter-text";
import { ConnectionsPanel } from "./connections-panel";
import { HighlightMarks } from "./highlight-marks";
import { NotePanel } from "./note-panel";
import { AnnotationMarks } from "./annotation-marks";
import { noteMarksInChapter, useAllNotes, useNotes, useOtherVersionCounts } from "./use-notes";
import { useHighlights } from "./use-highlights";
import { useAnnotations } from "./use-annotations";

/**
 * Book-style pagination. The chapter flows through fixed-height CSS columns
 * ([column-fill:auto]), overflowing horizontally; each "page" is one viewport
 * width (a 2-col spread on lg). We translate the flow sideways — no body
 * scroll, ever.
 */
export function PaginatedChapter({
  chapter,
  translation,
  heading,
  prevHref,
  nextHref,
  sideView,
  onSideViewChange,
}: {
  chapter: Chapter;
  translation: Translation;
  heading: string;
  prevHref: string | null;
  nextHref: string | null;
  /** The single side slot: 'connections' | a note id | null. */
  sideView: string | null;
  onSideViewChange: (view: string | null) => void;
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
  // Mobile (#13): the SHEET is print-fixed (same 2-col folio as desktop) —
  // phones read it one COLUMN per page, scaled to the viewport, never
  // reflowed. mobile.offset pins the viewport to the left column slot.
  const [mobile, setMobile] = useState<{ scale: number; offset: number } | null>(null);
  useEffect(() => {
    const rescale = () => {
      const box = contentBoxRef.current;
      const flow = contentRef.current;
      const vw = window.innerWidth;
      if (vw >= 640 || !box || !flow) {
        setMobile(null);
        return;
      }
      const gap = parseFloat(getComputedStyle(flow).columnGap || "0") || 0;
      const colW = (flow.clientWidth - gap) / 2;
      // Visible slice: one column + the sheet's own side padding as gutters
      const scale = vw / (colW + 48);
      setMobile({ scale, offset: box.offsetLeft * scale });
    };
    rescale();
    window.addEventListener("resize", rescale);
    return () => window.removeEventListener("resize", rescale);
  }, []);
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

  // Center the sheet in the pane whenever it stops fitting (doc open/close,
  // mobile scale applied)
  useEffect(() => {
    const vp = scrollRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!vp) return;
    // Mobile pins the viewport to the column slot — undo any pre-mobile
    // centering that would otherwise survive under overflow:hidden
    if (mobile) vp.scrollTo({ left: 0 });
    else vp.scrollTo({ left: (vp.scrollWidth - vp.clientWidth) / 2, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteId, mobile]);

  async function addNote(anchor: Parameters<typeof notesApi.add>[0]) {
    const created = await notesApi.add(anchor);
    if (created) setOpenNoteId(created.id);
  }

  /** Flip to the page holding a note mark and select it — every other mark
   * hides until deselected. Transform cancels out of both rects, so the page
   * math works from any current page. */
  function jumpToMark(markId: string) {
    const el = regionRef.current?.querySelector(
      `[data-annotation-anchor="${CSS.escape(markId)}"]`,
    );
    const content = contentRef.current;
    if (el && content && stride > 0) {
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
    if (!wantedMark || stride === 0) return;
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
  }, [wantedMark, stride, noteMarks.length]);


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
  }, [chapterKey]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(content).columnGap || "0") || 0;
      const width = content.clientWidth;
      if (width === 0) return;
      // Phones page column-by-column through the same fixed spread
      const nextStride = window.innerWidth < 640 ? (width - gap) / 2 + gap : width + gap;
      setStride(nextStride);
      setPageCount(Math.max(1, Math.ceil((content.scrollWidth + gap) / nextStride)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [chapterKey]);

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
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col">
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 w-full flex-1"
        onLayoutChanged={onSplitChange}
      >
      {/* The SHEET is a fixed-size artifact (text + margins) — print-fixed, it
          never reflows. The reading pane is a viewport onto it: when the doc
          panel takes part of the width, the pane scrolls instead of squeezing. */}
      <ResizablePanel
        id="reader"
        minSize="35%"
        defaultSize={openNote ? `${100 - noteSize}%` : "100%"}
        className="flex min-h-0 flex-col"
      >
      {/* Any click in the reader cancels the reference spotlight */}
      <div
        className="relative min-h-0 flex-1"
        onClick={() => selectedMarkId && setSelectedMarkId(null)}
      >
        {/* Mobile: the viewport is pinned to the left column slot (offset),
            pages translate the flow through it — no free horizontal scroll */}
        <ScrollArea
          ref={scrollRef}
          orientation={mobile ? "vertical" : "horizontal"}
          className="h-full"
          viewportClassName={mobile ? "overflow-hidden!" : undefined}
        >
          {/* isolate: local stacking context so the -z-10 leader arrows paint
              behind the text but still above the page background */}
          <div className="mx-auto h-full">
          <div
            ref={regionRef}
            className="relative isolate mx-auto h-full w-[75rem] origin-top-left"
            style={
              mobile
                ? {
                    transform: `scale(${mobile.scale})`,
                    height: `${100 / mobile.scale}%`,
                    marginLeft: -mobile.offset,
                  }
                : undefined
            }
          >
        <div
          ref={contentBoxRef}
          className="relative mx-auto h-full max-w-3xl overflow-hidden px-6 pt-10 pb-6"
        >
          <div
            ref={contentRef}
            className="h-full text-justify font-serif text-lg leading-9 text-foreground/95 hyphens-auto transition-transform duration-300 [column-fill:auto] columns-2 gap-x-24"
            style={{ transform: `translateX(-${page * stride}px)` }}
          >
            <ChapterText
              chapter={chapter}
              heading={heading}
              highlights={highlights}
              annotations={annotationsApi.annotations}
              noteMarks={noteMarks}
              allNotes={allNotes}
              otherVersionCounts={otherVersionCounts}
              activeAnnotationId={activeAnnotationId}
              selectedMarkId={selectedMarkId}
              mobile={!!mobile}
              onAddHighlight={add}
              onRemoveHighlight={remove}
              onAddAnnotation={annotationsApi.add}
              onAddNote={(anchor) => void addNote(anchor)}
              onAttachNote={(noteId, anchor) => void notesApi.attach(noteId, anchor)}
              onOpenNote={setOpenNoteId}
              onFocusAnnotation={setActiveAnnotationId}
            />
          </div>
        </div>

        {/* Before AnnotationMarks: same underlay stratum, so pen arrows paint over marker */}
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

        <AnnotationMarks
          annotations={annotationsApi.annotations}
          noteMarks={noteMarks}
          compact={mobile != null}
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
          </div>
        </ScrollArea>

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
      </div>

      <footer className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-t border-border px-6 py-3 font-mono text-[0.65rem] text-muted-foreground">
        <span className="truncate">
          {chapter.book}.{chapter.chapter} · {t("reader.verses", { count: chapter.verses.length })} ·{" "}
          {translation.abbreviation}
          {chapter.copyright ? ` · ${chapter.copyright}` : ""}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1 sm:flex">
            <kbd className="rounded border border-border bg-muted px-1">←</kbd>
            <kbd className="rounded border border-border bg-muted px-1">→</kbd>
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("reader.prevPage")}
            onClick={goPrev}
            disabled={page === 0 && !prevHref}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            p. {page + 1}/{pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("reader.nextPage")}
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
      {!mobile && sideView === "connections" && !openNote && (
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

      {!mobile && openNote && (
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

      {mobile && (
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
