import type { Chapter, NoteAnchor, Translation } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { ChapterText } from "./chapter-text";
import { HighlightMarks } from "./highlight-marks";
import { NotePanel } from "./note-panel";
import { AnnotationMarks } from "./annotation-marks";
import { noteMarksInChapter, useAllNotes, useNotes } from "./use-notes";
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
}: {
  chapter: Chapter;
  translation: Translation;
  heading: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [stride, setStride] = useState(0);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  // The reference selected in the note panel — its mark pulses amber
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
  // ?note=<id> keeps the panel open across chapter navigation (references
  // table jumps); ?mark=<mark id> flips to the linked span and flashes it.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openNoteId, setOpenNoteId] = useState<string | null>(
    () => searchParams.get("note"),
  );
  // An open note may have no anchor here (opened, then detached from this
  // chapter) — the all-notes list still has it.
  const openNote =
    notesApi.notes.find((f) => f.id === openNoteId) ??
    allNotes.find((f) => f.id === openNoteId) ??
    null;
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Center the sheet in the pane whenever it stops fitting (doc open/close)
  useEffect(() => {
    const vp = scrollRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (vp) vp.scrollTo({ left: (vp.scrollWidth - vp.clientWidth) / 2, behavior: "smooth" });
  }, [openNoteId]);

  async function addNote(anchor: Parameters<typeof notesApi.add>[0]) {
    const created = await notesApi.add(anchor);
    if (created) setOpenNoteId(created.id);
  }

  /** Flip to the page holding a note mark and select it — the mark pulses
   * amber until deselected. Transform cancels out of both rects, so the page
   * math works from any current page. */
  function jumpToMark(markId: string) {
    const el = regionRef.current?.querySelector(
      `[data-annotation-anchor="${CSS.escape(markId)}"]`,
    );
    const content = contentRef.current;
    if (el && content && stride > 0) {
      const target = Math.floor(
        (el.getBoundingClientRect().left - content.getBoundingClientRect().left) / stride,
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
      const nextStride = width + gap;
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
      <div className="relative min-h-0 flex-1">
        <ScrollArea ref={scrollRef} orientation="horizontal" className="h-full">
          {/* isolate: local stacking context so the -z-10 leader arrows paint
              behind the text but still above the page background */}
          <div ref={regionRef} className="relative isolate mx-auto h-full w-[75rem]">
        <div
          ref={contentBoxRef}
          className="relative mx-auto h-full max-w-2xl overflow-hidden px-6 pt-10 pb-6 lg:max-w-3xl"
        >
          <div
            ref={contentRef}
            className="h-full text-justify font-serif text-lg leading-9 text-foreground/95 hyphens-auto transition-transform duration-300 [column-fill:auto] columns-1 gap-x-24 lg:columns-2"
            style={{ transform: `translateX(-${page * stride}px)` }}
          >
            <ChapterText
              chapter={chapter}
              heading={heading}
              highlights={highlights}
              annotations={annotationsApi.annotations}
              noteMarks={noteMarks}
              allNotes={allNotes}
              activeAnnotationId={activeAnnotationId}
              selectedMarkId={selectedMarkId}
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
          dimmed={
            selectedMarkId != null &&
            noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId)
          }
        />

        <AnnotationMarks
          annotations={annotationsApi.annotations}
          noteMarks={noteMarks}
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
        </ScrollArea>

        {/* Page-flip zones, pinned to the pane edges */}
        <button
          type="button"
          aria-label="Previous page"
          onClick={goPrev}
          className="absolute inset-y-0 left-0 z-20 flex w-8 items-center justify-center text-muted-foreground/50 transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={goNext}
          className="absolute inset-y-0 right-0 z-20 flex w-8 items-center justify-center text-muted-foreground/50 transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <footer className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-t border-border px-6 py-3 font-mono text-[0.65rem] text-muted-foreground">
        <span className="truncate">
          {chapter.book}.{chapter.chapter} · {chapter.verses.length} verses ·{" "}
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
            aria-label="Previous page"
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
            aria-label="Next page"
            onClick={goNext}
            disabled={page >= pageCount - 1 && !nextHref}
          >
            <ChevronRight />
          </Button>
        </span>
      </footer>
      </ResizablePanel>

      {openNote && (
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
              onClose={() => {
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
              }}
            />
          </ResizablePanel>
        </>
      )}
      </ResizablePanelGroup>
    </main>
  );
}
