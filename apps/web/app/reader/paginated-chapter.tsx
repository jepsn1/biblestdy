import type { Chapter, Translation } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { ChapterText } from "./chapter-text";
import { HighlightMarks } from "./highlight-marks";
import { NoteMarks } from "./note-marks";
import { useHighlights } from "./use-highlights";
import { useNotes } from "./use-notes";

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
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const { highlights, add, remove } = useHighlights(
    chapter.translationId,
    chapter.book,
    chapter.chapter,
  );
  const notesApi = useNotes(chapter.translationId, chapter.book, chapter.chapter);

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
      {/* isolate: local stacking context so the -z-10 leader arrows paint
          behind the text but still above the page background */}
      <div ref={regionRef} className="relative isolate min-h-0 flex-1">
        <div
          ref={contentBoxRef}
          className="relative mx-auto h-full max-w-2xl overflow-hidden px-6 pt-10 pb-6 lg:max-w-3xl"
        >
          <div
            ref={contentRef}
            className="h-full font-serif text-lg leading-9 text-foreground/95 transition-transform duration-300 [column-fill:auto] columns-1 gap-x-24 lg:columns-2"
            style={{ transform: `translateX(-${page * stride}px)` }}
          >
            <ChapterText
              chapter={chapter}
              heading={heading}
              highlights={highlights}
              notes={notesApi.notes}
              activeNoteId={activeNoteId}
              onAddHighlight={add}
              onRemoveHighlight={remove}
              onAddNote={notesApi.add}
              onFocusNote={setActiveNoteId}
            />
          </div>
        </div>

        {/* Before NoteMarks: same underlay stratum, so pen arrows paint over marker */}
        <HighlightMarks
          highlights={highlights}
          regionRef={regionRef}
          contentRef={contentBoxRef}
          page={page}
        />

        <NoteMarks
          notes={notesApi.notes}
          regionRef={regionRef}
          contentRef={contentBoxRef}
          page={page}
          activeNoteId={activeNoteId}
          onFocus={setActiveNoteId}
          onEdit={notesApi.edit}
          onRemove={notesApi.remove}
          onPlace={notesApi.place}
        />

        {/* Edge tap zones, like flipping a page */}
        <button
          type="button"
          aria-label="Previous page"
          onClick={goPrev}
          className="absolute inset-y-0 left-0 z-20 w-8 cursor-w-resize opacity-0"
        />
        <button
          type="button"
          aria-label="Next page"
          onClick={goNext}
          className="absolute inset-y-0 right-0 z-20 w-8 cursor-e-resize opacity-0"
        />
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
    </main>
  );
}
