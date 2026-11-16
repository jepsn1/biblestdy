import { useTranslation } from "react-i18next";
import type { Anchor, Chapter, Note, NoteAnchor, ScriptureRef, Translation } from "@biblestdy/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ScrollArea } from "~/components/ui/scroll-area";
import { bookLocale, useBookName } from "~/lib/book-name";
import { noteView } from "~/lib/fums";
import { ApiError, api } from "~/lib/query";
import { chipLabel, referenceLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { useReadingTranslationId } from "../notes/add-reference";
import {
  anchorLabel,
  anchorSnippet,
  chapterKey,
  overviewRows,
  refSnippet,
  snippetChapterOf,
  snippetChapters,
  type OverviewRow,
} from "../notes/note-list";
import { ScriptureCredit } from "./scripture-credit";

/** A note's reader selection as a chip label ("Joh 3,14–15"). */
const anchorChip = (a: Anchor, locale: "da" | "en") =>
  chipLabel({ book: a.book, chapter: a.chapter, verse: a.startVerse, endVerse: a.endVerse }, locale);

/** Snippets are cut here; the cell truncates too (narrow panels). */
const SNIPPET_MAX = 90;

/**
 * A note's references overview (#161; owner: "a clear view of all
 * references without having to read the note itself"). The references in the
 * text in text order (derived from the live body), then the reader's
 * selections in Bible order — two subheads only when both kinds exist. Each
 * row: the label, a snippet cut on a word, and the translation it quotes
 * (whole-verse refs: the one being read; selections: their own). Rows have
 * fixed heights, so snippets arriving never move anything. Click reads
 * there; "Show in text" selects the chip, "Insert in text" puts a
 * selection into the text; × (selections only) removes with Undo.
 */
export function ReferencesOverview({
  note,
  body,
  selectedAnchorId,
  onShowAnchor,
  onReadRef,
  onDetach,
  onAttach,
  onAddVerse,
  onShowInText,
  onInsertInText,
  collapsed = false,
  onExpand,
  onNaturalHeight,
  mobile = false,
}: {
  note: Note;
  /** The live body (ahead of the save). */
  body: string;
  selectedAnchorId: string | null;
  onShowAnchor: (anchor: NoteAnchor) => void;
  onReadRef?: (ref: ScriptureRef, translationId?: string) => void;
  /** Resolves to the updated note, or null when it failed (said by a toast). */
  onDetach: (id: string, anchorId: string) => Promise<unknown> | void;
  /** Undo of a removal: the same selection back. */
  onAttach?: (id: string, anchor: Anchor) => Promise<unknown>;
  /** "+ Verse": the same dialog as the editor's toolbar button. */
  onAddVerse: () => void;
  /** Selects the reference's chip in the text; its spoken confirmation. */
  onShowInText: (ref: ScriptureRef) => boolean;
  onInsertInText: (anchor: NoteAnchor) => void;
  /** Phone, while writing: one line ("Verses (4)"), tap to open. */
  collapsed?: boolean;
  onExpand?: () => void;
  /** The content's natural height in px (heading + rows + credit, or the
   * empty line), for the pane to hug. */
  onNaturalHeight?: (px: number) => void;
  mobile?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const readingId = useReadingTranslationId();
  const translations = useQuery({
    queryKey: ["translations"],
    queryFn: () => api<Translation[]>("/api/translations"),
    staleTime: Infinity,
  });
  const abbrOf = (id: string | undefined) => translations.data?.find((tr) => tr.id === id)?.abbreviation ?? "";
  const readingAbbr = abbrOf(readingId);
  // Not in the reading translation: the canonical (English-numbered) one
  const web = translations.data?.find((tr) => tr.abbreviation === "WEB" && tr.id !== readingId);

  const rows = useMemo(() => overviewRows(body, note.anchors), [body, note.anchors]);
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const chapters = snippetChapters(rows, readingId, { asked });
  const results = useQueries({
    queries: chapters.map((c) => ({
      queryKey: ["chapter", c.translationId, c.book, c.chapter],
      queryFn: () => api<Chapter>(`/api/passages/${c.translationId}/${c.book}/${c.chapter}`),
      staleTime: 60 * 60 * 1000, // scripture text is immutable, cache hard
      retry: (n: number, e: Error) => !(e instanceof ApiError && e.status === 404) && n < 2,
    })),
  });
  const fetched = new Map(chapters.map((c, i) => [chapterKey(c), results[i]]));
  // The snippets show their words: each chapter shown counts as a view (FUMS)
  const tokens = results.map((r) => r.data?.fumsToken ?? "").join(" ");
  useEffect(() => {
    for (const token of tokens.split(" ")) if (token) noteView(token);
  }, [tokens]);

  const text = rows.filter((r) => r.kind === "text");
  const marked = rows.filter((r) => r.kind === "marked");
  const both = text.length > 0 && marked.length > 0;
  // The credit names what is quoted: the reading translation for text refs,
  // each selection's own
  const quoted = [
    ...new Set([...(text.length ? [readingAbbr] : []), ...marked.map((r) => abbrOf(r.anchor.translationId))]),
  ].filter(Boolean);

  // Focus after a removal: the next row, else the previous, else "+ Verse"
  const sectionRef = useRef<HTMLElement>(null);
  const focusAfter = (key: string | null) =>
    requestAnimationFrame(() => {
      const root = sectionRef.current;
      const el =
        (key && root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`)) ||
        root?.querySelector<HTMLElement>("[data-add-verse]");
      el?.focus({ preventScroll: true });
    });
  async function remove(a: NoteAnchor) {
    const at = marked.findIndex((r) => r.anchor.id === a.id);
    const next = marked[at + 1] ?? marked[at - 1] ?? text.at(-1);
    const updated = await onDetach(note.id, a.id);
    if (updated === null) return; // failed: its toast said so
    focusAfter(next?.key ?? null);
    if (!onAttach) return;
    const { id: _id, ...anchor } = a;
    // Corner, no focus taken (as a chip's removal, #160)
    toast(t("note.refRemoved", { ref: anchorChip(a, locale) }), {
      duration: 6000,
      position: "bottom-right",
      className: "!w-auto !text-list",
      action: { label: t("toast.undo"), onClick: () => void onAttach(note.id, anchor) },
    });
  }

  // The natural height: the section's padding + heading + the body's own
  // height (inside the scroll viewport it isn't squeezed)
  const onHeight = useRef(onNaturalHeight);
  useEffect(() => {
    onHeight.current = onNaturalHeight;
  });
  const empty = rows.length === 0;
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || collapsed || !onHeight.current) return;
    const parts = () => [...section.querySelectorAll<HTMLElement>("[data-measure]")];
    const measure = () => {
      const style = getComputedStyle(section);
      const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      onHeight.current?.(Math.ceil(pad + parts().reduce((h, el) => h + el.offsetHeight, 0)));
    };
    const ro = new ResizeObserver(measure);
    for (const el of parts()) ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [collapsed, empty]);

  // Said to a screen reader when "Show in text" has moved focus to a chip
  const [said, setSaid] = useState("");

  const heading = (
    <h3 className="eyebrow">
      {t("note.references")}
      {rows.length > 0 && <span className="tabular-nums"> · {rows.length}</span>}
    </h3>
  );
  const addVerse = (inline: boolean) => (
    <button
      type="button"
      data-add-verse=""
      aria-label={t("note.insertVerseTitle")}
      onClick={onAddVerse}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm font-sans text-muted-foreground hover:text-foreground",
        inline ? "-mx-0.5 px-0.5 align-baseline font-medium text-primary hover:text-primary hover:underline" : "h-7 px-1.5 text-meta",
        !inline && (mobile ? "h-11" : "pointer-coarse:h-11"),
        inline && (mobile ? "min-h-11" : "pointer-coarse:min-h-11"),
        focusRing,
      )}
    >
      <Plus className={inline ? "size-3" : "size-3.5"} aria-hidden />
      {t("note.verseButton")}
    </button>
  );

  if (collapsed)
    return (
      <button
        type="button"
        aria-expanded={false}
        // Keeps the editor's focus (and the phone keyboard) while it opens
        onMouseDown={(e) => e.preventDefault()}
        onClick={onExpand}
        className={cn("flex h-11 w-full items-center justify-between px-3 text-meta font-semibold tracking-[0.08em] text-muted-foreground uppercase", focusRing)}
      >
        <span className="tabular-nums">
          {rows.length ? t("note.referencesCollapsed", { count: rows.length }) : t("note.references")}
        </span>
        <ChevronUp className="size-4" aria-hidden />
      </button>
    );

  const renderRow = (row: OverviewRow): ReactNode => {
    const c = snippetChapterOf(row, readingId);
    const key = c && chapterKey(c);
    const result = key ? fetched.get(key) : undefined;
    const capped = !!key && !result;
    const missing = result?.error instanceof ApiError && result.error.status === 404;
    const chapter = missing ? null : result?.data;
    let label: string;
    let full: string;
    let snippet = "";
    let source = "";
    let read: () => void;
    let readName = t("note.readPassage");
    let action: ReactNode = null;
    let pressed: boolean | undefined;

    const actionClass = cn(
      "rounded-sm px-1 text-meta font-medium whitespace-nowrap text-primary hover:underline",
      mobile ? "min-h-11" : "min-h-6 pointer-coarse:min-h-11",
      !mobile && "invisible group-focus-within:visible group-hover:visible pointer-coarse:visible",
      focusRing,
    );

    if (row.kind === "text") {
      const r = row.ref;
      label = chipLabel(r, locale);
      full = referenceLabel(r, nameOf, locale);
      read = () => onReadRef?.(r);
      const got = chapter !== undefined ? refSnippet(r, chapter, SNIPPET_MAX) : null;
      if (got === "notInTranslation") {
        snippet = t("note.notInShort", { abbr: readingAbbr });
        if (web) {
          source = t("note.readIn", { abbr: web.abbreviation });
          readName = source;
          read = () => onReadRef?.(r, web.id);
        }
      } else {
        if (got) snippet = got.text;
        const sep = locale === "da" ? "," : ":";
        source = got?.at.bridged
          ? t("note.refIn", { abbr: readingAbbr, ref: `${r.chapter}${sep}${got.at.printedStart}–${got.at.printedEnd}` })
          : readingAbbr;
      }
      action = (
        <button
          type="button"
          aria-label={`${t("note.showInText")}, ${full}`}
          onClick={() => {
            if (onShowInText(r)) setSaid(t("note.shownInText", { ref: full }));
          }}
          className={actionClass}
        >
          {t("note.showInText")}
        </button>
      );
    } else {
      const a = row.anchor;
      label = anchorChip(a, locale);
      full = anchorLabel(a, nameOf, locale);
      pressed = a.id === selectedAnchorId;
      if (pressed) readName = t("note.deselect");
      read = () => onShowAnchor(a);
      if (chapter) snippet = anchorSnippet(chapter, a, SNIPPET_MAX);
      const home = abbrOf(a.translationId);
      // Written in another translation: say so (#159's "Skrevet i WEB")
      source = home && a.translationId !== readingId ? t("connections.writtenIn", { abbr: home }) : home;
      action = (
        <button type="button" aria-label={`${t("note.insertInText")}, ${full}`} onClick={() => onInsertInText(a)} className={actionClass}>
          {t("note.insertInText")}
        </button>
      );
    }

    const showText = capped && key && (
      <button
        type="button"
        aria-label={`${t("note.showText")}, ${full}`}
        onClick={() => setAsked((s) => new Set(s).add(key))}
        className={cn(actionClass, "visible")}
      >
        {t("note.showText")}
      </button>
    );
    const x =
      row.kind === "marked" ? (
        <button
          type="button"
          aria-label={t("note.removeReferenceNamed", { ref: full })}
          title={t("note.removeReference")}
          onClick={() => void remove(row.anchor)}
          className={cn(
            "inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive",
            mobile ? "size-11" : "size-6 pointer-coarse:size-11",
            !mobile && "invisible group-focus-within:visible group-hover:visible pointer-coarse:visible",
            focusRing,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : (
        <span />
      );

    const labelEl = <span className="font-sans text-list font-medium whitespace-nowrap text-primary tabular-nums">{label}</span>;
    // Quoted scripture: roman, never italic (Mads)
    const snippetEl = <span className="min-w-0 truncate font-serif text-list text-muted-foreground">{snippet}</span>;
    const sourceEl = <span className="font-sans text-meta whitespace-nowrap text-muted-foreground">{source}</span>;

    return mobile ? (
      // Phone: two lines (label · translation / snippet), fixed height
      <li key={row.key} className={cn("group flex items-center gap-1 rounded", pressed ? "bg-accent" : "active:bg-accent")}>
        <button
          type="button"
          data-row={row.key}
          aria-label={`${full}: ${readName}`}
          aria-pressed={pressed}
          onClick={read}
          className={cn("flex h-13 min-w-0 flex-1 flex-col justify-center rounded px-1.5 text-left", focusRing)}
        >
          <span className="flex min-w-0 items-baseline gap-1.5">
            {labelEl}
            {source && <span className="truncate font-sans text-meta text-muted-foreground">· {source}</span>}
          </span>
          <span className="block h-5 min-w-0 truncate font-serif text-list text-muted-foreground">{snippet}</span>
        </button>
        {showText}
        {action}
        {x}
      </li>
    ) : (
      // Desktop: one line in the list's columns (label | snippet |
      // translation | action | ×), so snippets line up
      <li key={row.key} className={cn("group col-span-full grid grid-cols-subgrid items-center rounded", pressed ? "bg-accent" : "hover:bg-accent")}>
        <button
          type="button"
          data-row={row.key}
          title={readName}
          aria-label={`${full}: ${readName}`}
          aria-pressed={pressed}
          onClick={read}
          className={cn("col-span-3 grid h-8 grid-cols-subgrid items-baseline rounded px-1.5 text-left pointer-coarse:h-11", focusRing)}
        >
          {labelEl}
          {snippetEl}
          {sourceEl}
        </button>
        <span className="flex items-center justify-end">
          {showText}
          {!capped && action}
        </span>
        {x}
      </li>
    );
  };

  const group = (title: string, items: OverviewRow[]) => {
    const list = (
      <ul aria-label={both ? undefined : t("note.references")} className={cn(!mobile && "col-span-full grid grid-cols-subgrid", mobile && "flex flex-col")}>
        {items.map(renderRow)}
      </ul>
    );
    return both ? (
      <div key={title} role="group" aria-label={title} className={cn(!mobile && "col-span-full grid grid-cols-subgrid")}>
        <h4 className="col-span-full px-1.5 pt-1.5 pb-0.5 font-sans text-meta text-muted-foreground">{title}</h4>
        {list}
      </div>
    ) : (
      <div key={title} className={cn(!mobile && "col-span-full grid grid-cols-subgrid")}>{list}</div>
    );
  };

  return (
    <section ref={sectionRef} className="flex h-full min-h-0 flex-col px-3 pt-1 pb-1.5">
      <div className="flex min-h-0 flex-1 flex-col">
        <div data-measure="head" className="flex shrink-0 items-center justify-between gap-2 py-1">
          {heading}
          {rows.length > 0 && addVerse(false)}
        </div>
        {rows.length === 0 ? (
          <p data-measure="body" className="px-0.5 pb-1 font-sans text-meta text-muted-foreground">
            {t("note.emptyBefore")} {addVerse(true)}
            {t("note.emptyAfter")}
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1" viewportClassName={mobile ? "max-h-[inherit]" : undefined}>
            <div data-measure="body">
              <div
                className={cn(
                  !mobile && "grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)_auto_auto_auto] gap-x-2.5",
                  mobile && "flex flex-col",
                )}
              >
                {text.length > 0 && group(t("note.groupText"), text)}
                {marked.length > 0 && group(t("note.groupMarked"), marked)}
              </div>
              {/* The snippets quote Bible text: its copyright link (ToS §7.2),
                  naming what's quoted — there from the start, so nothing moves */}
              <ScriptureCredit className="px-1.5 pt-1" quoted={quoted} />
            </div>
          </ScrollArea>
        )}
      </div>
      <span role="status" className="sr-only">
        {said}
      </span>
    </section>
  );
}
