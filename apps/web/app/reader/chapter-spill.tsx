import type { Anchor, Chapter, HighlightColor, Note } from "@biblestdy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFumsView } from "~/lib/fums";
import { revealColor, setHighlightFilter, type HighlightFilter } from "~/lib/highlight-filter";
import { AnnotationMarks } from "./annotation-marks";
import { ChapterText } from "./chapter-text";
import { HighlightMarks } from "./highlight-marks";
import type { ReaderTool } from "./tool-palette";
import { useAnnotations } from "./use-annotations";
import { useHighlights } from "./use-highlights";
import { noteMarksInChapter, useNotes, useOtherVersionCounts } from "./use-notes";

/** Most verses ever tried on one page (the rest can't fit anyway). */
const MAX_TRY = 60;

/** What one run-on section carries: its chapter's verses up to `to`; that
 * chapter goes on from `nextFrom` when the reader turns the page — null =
 * the whole chapter fit, and the one after may run on below it. */
export type RunOn = { to: number; toLabel: string; nextFrom: number | null };

/**
 * Chapters run on, like a printed Bible: when a chapter ends part-way down
 * its last page, the next chapter's opening (numeral, passage heading,
 * verses) fills the rest of that page instead of leaving it nearly empty.
 * Whole verses only (one may break across the page's columns), as many as
 * fit under the chapter's end. A short chapter that fits whole lets the
 * next one run on below it (a chain; the reader caps it). Turning the page
 * goes on into the first chapter not wholly shown, from its first verse
 * not shown here.
 *
 * Fully live, not a preview: its own highlights, pen marks, notes and
 * selections, anchored to its own chapter as always (a selection never
 * spans the two). Desktop paged sheet only; drawn from the read-ahead.
 */
export function ChapterSpill({
  chapter,
  translationAbbreviation,
  language,
  heading,
  bookName,
  boxRef,
  lastPage,
  stride,
  pageOf,
  layoutKey,
  inlineAnnotations,
  marginBoxes,
  tool,
  shown,
  allNotes,
  activeAnnotationId,
  selectedMarkId,
  onFocusAnnotation,
  onOpenNote,
  onRunOn,
  washHost,
  marginHost,
  penHost,
  regionRef,
  contentBoxRef,
  flowRef,
  page,
  marginHidden,
}: {
  /** The next chapter (same book). */
  chapter: Chapter;
  translationAbbreviation: string;
  language: string;
  heading: string;
  bookName: string;
  /** Its place in the flow (the reader hides it to count its own pages). */
  boxRef: RefObject<HTMLDivElement | null>;
  /** The current chapter's last page (0-based): everything shown fits on it. */
  lastPage: number;
  stride: number;
  pageOf: (el: Element) => number | null;
  layoutKey: string;
  inlineAnnotations: boolean;
  marginBoxes: boolean;
  tool: ReaderTool;
  shown: HighlightFilter;
  allNotes: Note[];
  activeAnnotationId: string | null;
  selectedMarkId: string | null;
  onFocusAnnotation: (id: string | null) => void;
  onOpenNote: (id: string) => void;
  /** What fits, once measured (null: nothing runs on). */
  onRunOn: (runOn: RunOn | null) => void;
  /** Ink layers of the content box (marker behind, margin, pen in front). */
  washHost: HTMLElement | null;
  marginHost: HTMLElement | null;
  penHost: HTMLElement | null;
  regionRef: RefObject<HTMLDivElement | null>;
  contentBoxRef: RefObject<HTMLDivElement | null>;
  flowRef: RefObject<HTMLDivElement | null>;
  page: number;
  marginHidden: boolean;
}) {
  const qc = useQueryClient();
  const { translationId, book } = chapter;
  const highlightsApi = useHighlights(translationId, book, chapter.chapter, chapter);
  const annotationsApi = useAnnotations(translationId, book, chapter.chapter, chapter);
  const notesApi = useNotes(translationId, book, chapter.chapter);
  const otherVersionCounts = useOtherVersionCounts(translationId, book, chapter.chapter);
  const noteMarks = noteMarksInChapter(notesApi.notes, translationId, book, chapter.chapter);
  const [selection, setSelection] = useState<Anchor | null>(null);
  const onSelectionChange = useCallback((a: Anchor | null) => setSelection(a), []);
  const [rovingVerse, setRovingVerse] = useState<number | null>(null);

  // Candidates: every verse (MAX_TRY at most)
  const candidates = chapter.verses.slice(0, MAX_TRY);
  // Fitted for one layout: anything that moves words re-fits (fonts too)
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && setFontTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);
  const inkSig = annotationsApi.annotations.map((a) => `${a.id}:${a.text?.length ?? 0}`).join();
  const sig = `${translationId}/${book}.${chapter.chapter}|${lastPage}|${stride}|${layoutKey}|${inkSig}|${fontTick}`;
  const [fit, setFit] = useState<{ sig: string; n: number } | null>(null);
  const n = fit?.sig === sig ? fit.n : null;
  // Shown once the reader is on the page it runs on into (FUMS)
  useFumsView(page >= lastPage && n ? chapter : null);

  // Measured before paint: first every candidate is laid out after the
  // chapter's end, then only the leading verses that sit wholly on its last
  // page stay. Afterwards, anything pushed off that page (the chapter above
  // grew: an annotation line, a webfont) gives back a verse. Every render:
  // the check is cheap, and each step settles (a measured fit, or one less).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || stride <= 0) return;
    const offPage = (el: Element) => (pageOf(el) ?? 0) > lastPage;
    if (n === null) {
      let count = 0;
      for (const v of candidates) {
        const els = [...box.querySelectorAll(`[data-verse="${v.verse}"][data-word]`)];
        if (els.length === 0 || els.some(offPage)) break;
        count++;
      }
      setFit({ sig, n: count });
    } else if (n > 0 && [...box.querySelectorAll("[data-word], [data-ink-box]")].some(offPage)) {
      setFit({ sig, n: n - 1 });
    }
  });

  const shownTo = n === null ? candidates.at(-1) : n > 0 ? candidates[n - 1] : undefined;
  const runOn: RunOn | null =
    n && shownTo
      ? { to: shownTo.verse, toLabel: shownTo.label ?? String(shownTo.verse), nextFrom: chapter.verses[n]?.verse ?? null }
      : null;
  const runOnKey = runOn ? `${runOn.to}/${runOn.nextFrom}` : "";
  useEffect(() => {
    // Only once measured (a fit in progress says nothing yet)
    if (n !== null) onRunOn(runOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runOnKey stands for runOn
  }, [runOnKey, n === null]);
  useEffect(() => () => onRunOn(null), [onRunOn]);

  if (!shownTo) return null;
  const span = { from: candidates[0].verse, to: shownTo.verse };

  function add(anchor: Anchor, color: HighlightColor) {
    setHighlightFilter(revealColor(shown, color));
    return highlightsApi.add(anchor, color);
  }
  function recolor(id: string, color: HighlightColor) {
    setHighlightFilter(revealColor(shown, color));
    return highlightsApi.recolor(id, color);
  }
  async function addNote(anchor: Anchor) {
    const created = await notesApi.add(anchor);
    if (!created) return;
    // The note panel finds it among all notes straight away
    qc.setQueryData<Note[]>(["notes", "all"], (list = []) => [...list.filter((x) => x.id !== created.id), created]);
    onOpenNote(created.id);
  }

  return (
    <>
      <ChapterText
        chapter={chapter}
        verses={span}
        translationAbbreviation={translationAbbreviation}
        language={language}
        heading={heading}
        // Runs on under this page's chapter: an h2, not a second h1
        headingLevel={2}
        bookName={bookName}
        highlights={highlightsApi.highlights}
        annotations={annotationsApi.annotations}
        noteMarks={noteMarks}
        allNotes={allNotes}
        otherVersionCounts={otherVersionCounts}
        activeAnnotationId={activeAnnotationId}
        selectedMarkId={selectedMarkId}
        onAddHighlight={add}
        onRecolorHighlight={recolor}
        onRemoveHighlight={highlightsApi.remove}
        onAddAnnotation={annotationsApi.add}
        onEditAnnotation={annotationsApi.edit}
        onMarkAnnotation={(id, mark) => void annotationsApi.place(id, { mark })}
        onRemoveAnnotation={annotationsApi.remove}
        onSelectionChange={onSelectionChange}
        rovingVerse={rovingVerse}
        onRovingVerseChange={setRovingVerse}
        inlineAnnotations={inlineAnnotations}
        onAddNote={(anchor) => void addNote(anchor)}
        onAttachNote={(noteId, anchor) => void notesApi.attach(noteId, anchor)}
        onOpenNote={onOpenNote}
        onFocusAnnotation={onFocusAnnotation}
        tool={tool}
      />
      {washHost &&
        createPortal(
          <HighlightMarks
            highlights={highlightsApi.highlights}
            shown={shown}
            selection={selection}
            boxRef={contentBoxRef}
            flowRef={flowRef}
            scopeRef={boxRef}
            layoutKey={`${layoutKey}:${span.to}`}
            hidden={selectedMarkId != null}
          />,
          washHost,
        )}
      {marginHost &&
        createPortal(
          <AnnotationMarks
            annotations={annotationsApi.annotations}
            noteMarks={noteMarks}
            flowRef={flowRef}
            scopeRef={boxRef}
            page={page}
            stride={stride}
            penHost={penHost}
            marginHidden={marginHidden}
            marginBoxes={marginBoxes}
            regionRef={regionRef}
            contentRef={contentBoxRef}
            layoutKey={`${layoutKey}:${span.to}`}
            activeAnnotationId={activeAnnotationId}
            selectedMarkId={selectedMarkId}
            onFocus={onFocusAnnotation}
            onEdit={annotationsApi.edit}
            onRemove={annotationsApi.remove}
            onPlace={annotationsApi.place}
            onOpenNote={onOpenNote}
          />,
          marginHost,
        )}
    </>
  );
}
