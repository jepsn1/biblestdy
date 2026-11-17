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
  type LocalizeRef,
  type OverviewRow,
} from "../notes/note-list";
import { canonicalRef, localRef } from "@biblestdy/shared/versification";
import { makeLocalizer } from "./localizer";
import type { ReadRef } from "./ref-context";
import { ScriptureCredit } from "./scripture-credit";
import { refTag, type RefLocator } from "./ref-location";
import { noteMarkId, refSpot } from "./spotlight";

/** A note's reader selection as a chip label ("Joh 3,14–15"). */
const anchorChip = (a: Anchor, locale: "da" | "en") =>
  chipLabel({ book: a.book, chapter: a.chapter, verse: a.startVerse, endVerse: a.endVerse }, locale);

/** An anchor's verses as a reference (its own translation's numbers). */
const anchorRef = (a: Anchor): ScriptureRef => ({
  book: a.book,
  chapter: a.chapter,
  verse: a.startVerse,
  ...(a.endVerse !== a.startVerse && { endVerse: a.endVerse }),
});

/** Snippets are cut here; the cell truncates too (narrow panels). */
const SNIPPET_MAX = 90;

/**
 * A note's references overview (#161; owner: "a clear view of all
 * references without having to read the note itself"). The references in the
 * text in text order (derived from the live body), then the reader's
 * selections in Bible order — two subheads only when both kinds exist. Each
 * row: the label, a snippet cut on a word, and the translation it quotes
 * (whole-verse refs: the one being read; selections: their own). Rows have
 * fixed heights, so snippets arriving never move anything. Click shows it
 * in the Bible ("Vis i Bibelen", + the translation when the row quotes
 * another); "Find i noten" selects the chip, "Tilføj i noten" puts a
 * selection into the text; × removes either kind with Undo (a text
 * reference: its chips leave the text). Actions show at rest (#214).
 * Text refs are canonical numbers, shown where the reading translation has
 * them (#163), a bridge or renumbering said: "Joh 3,16 … = BPH 3,15–16".
 * Beside the reader each row says where it is: "denne side", "s. 3",
 * "Rom 8" (ref-location.ts).
 */
export type ReferencesOverviewProps = Parameters<typeof ReferencesOverview>[0];

export function ReferencesOverview({
  note,
  body,
  spot,
  onShowAnchor,
  onReadRef,
  onDetach,
  onAttach,
  onAddVerse,
  onShowInText,
  onInsertInText,
  onRemoveRef,
  locator,
  collapsed = false,
  onExpand,
  onNaturalHeight,
  mobile = false,
}: {
  note: Note;
  /** The live body (ahead of the save). */
  body: string;
  /** The spotlit reference's id (spotlight.ts): its row is pressed. */
  spot: string | null;
  onShowAnchor: (anchor: NoteAnchor) => void;
  onReadRef?: ReadRef;
  /** Resolves to the updated note, or null when it failed (said by a toast). */
  onDetach: (id: string, anchorId: string) => Promise<unknown> | void;
  /** Undo of a removal: the same selection back. */
  onAttach?: (id: string, anchor: Anchor) => Promise<unknown>;
  /** "+ Verse": the same dialog as the editor's toolbar button. */
  onAddVerse: () => void;
  /** Selects the reference's chip in the text; its spoken confirmation. */
  onShowInText: (ref: ScriptureRef) => boolean;
  /** A selection as a canonical (English-numbered) ref, for its href. */
  onInsertInText: (ref: ScriptureRef) => void;
  /** × on a text reference: its chips out of the text (Undo: the editor's
   * removal toast). */
  onRemoveRef?: (ref: ScriptureRef) => void;
  /** The reader beside it: the rows' location tags. */
  locator?: RefLocator;
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

  // Stored numbers ↔ the reading translation's (#163); null until the
  // translation list is in (text rows wait rather than guess)
  const loc = useMemo(
    () => (translations.data && readingId ? makeLocalizer({ localRef, canonicalRef }, translations.data, readingId) : null),
    [translations.data, readingId],
  );
  const localize: LocalizeRef = (r) => loc?.local(r)?.ref ?? null;

  const rows = useMemo(() => overviewRows(body, note.anchors), [body, note.anchors]);
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const chapters = snippetChapters(rows, readingId, { asked, localize });
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
  // (after the list has re-rendered without the row)
  const [focusNext, setFocusNext] = useState<{ key: string | null } | null>(null);
  useEffect(() => {
    if (!focusNext) return;
    const root = sectionRef.current;
    const el =
      (focusNext.key && root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(focusNext.key)}"]`)) ||
      root?.querySelector<HTMLElement>("[data-add-verse]");
    el?.focus({ preventScroll: true });
    setFocusNext(null);
  }, [focusNext, rows]);
  const focusAfter = (key: string | null) => setFocusNext({ key });
  /** The row focus goes to once `key`'s row is gone. */
  const neighbour = (key: string) => {
    const at = rows.findIndex((r) => r.key === key);
    return (rows[at + 1] ?? rows[at - 1])?.key ?? null;
  };
  function removeText(row: OverviewRow & { kind: "text" }) {
    if (!onRemoveRef) return;
    const next = neighbour(row.key);
    onRemoveRef(row.ref);
    focusAfter(next);
  }
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

  // A pane too narrow for one line per row (large text, a slim panel):
  // the phone's two lines. Width in rem, so 200% text gets there too
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || mobile) return;
    const ro = new ResizeObserver(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(section.clientWidth / rem < 36);
    });
    ro.observe(section);
    return () => ro.disconnect();
  }, [mobile]);
  const stacked = mobile || narrow;

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
        data-refs-collapsed=""
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
    const c = snippetChapterOf(row, readingId, localize);
    const key = c && chapterKey(c);
    const result = key ? fetched.get(key) : undefined;
    const capped = !!key && !result;
    const missing = result?.error instanceof ApiError && result.error.status === 404;
    const chapter = missing ? null : result?.data;
    let label: string;
    let full: string;
    let snippet = "";
    // A note about the text, not its words: UI font
    let plain = false;
    let source = "";
    let read: () => void;
    let readName = t("note.readPassage");
    let action: ReactNode = null;
    let pressed: boolean | undefined;
    // The row's tint (pressed, hovered, tapped): gold and grey fall short
    // of 4.5:1 on it (#196)
    const on =
      spot !== null &&
      spot === (row.kind === "text" ? refSpot(note.id, row.ref) : noteMarkId({ noteId: note.id, id: row.anchor.id }));
    const tinted = mobile ? "group-active:text-accent-foreground" : "group-hover:text-accent-foreground";
    const muted = on ? "text-accent-foreground" : cn("text-muted-foreground", tinted);
    const gold = on ? "text-accent-foreground" : cn("text-primary", tinted);
    // The reference itself in the note's ink: one relation, one colour (#214)
    const blue = on ? "text-accent-foreground" : cn("text-(--note-ink-text)", tinted);
    // Where it is (its chapter in the reading translation's numbers)
    let spotKey: string | null;
    let at: { book: string; chapter: number } | null = null;

    const actionClass = cn(
      "rounded-sm px-1 text-meta font-medium whitespace-nowrap hover:underline",
      gold,
      mobile ? "min-h-11" : "min-h-6 pointer-coarse:min-h-11",
      focusRing,
    );

    if (row.kind === "text") {
      const r = row.ref;
      label = chipLabel(r, locale);
      full = referenceLabel(r, nameOf, locale);
      // undefined: not known yet; null: no counterpart here (Neh 7:68 in BPH)
      const local = loc ? loc.local(r) : undefined;
      read = () => onReadRef?.(r, local?.ref ?? r, undefined, true);
      spotKey = refSpot(note.id, r);
      if (local) at = local.ref;
      pressed = on;
      if (pressed) readName = t("note.deselect");
      const got = local === null ? "notInTranslation" : local && chapter !== undefined ? refSnippet(local.ref, chapter, SNIPPET_MAX) : null;
      if (got === "notInTranslation") {
        snippet = t("note.notInShort", { abbr: readingAbbr });
        plain = true;
        if (web) {
          source = t("note.readIn", { abbr: web.abbreviation });
          readName = source;
          read = () => onReadRef?.(r, r, web.id);
        }
      } else {
        if (got) snippet = got.text;
        const sep = locale === "da" ? "," : ":";
        // Numbered differently here, or a bridge: say where ("i BPH 3,23")
        const printed = got?.at;
        const verses = printed && (printed.printedEnd > printed.printedStart ? `${printed.printedStart}–${printed.printedEnd}` : `${printed.printedStart}`);
        // "Joh 3,16 … = BPH 3,15–16": the reader's translation prints it so
        source =
          printed && local && (printed.bridged || local.renumbered)
            ? t("note.bridgeNote", { abbr: readingAbbr, ref: `${local.ref.chapter}${sep}${verses}` })
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
      pressed = on;
      if (pressed) readName = t("note.deselect");
      read = () => onShowAnchor(a);
      spotKey = noteMarkId({ noteId: note.id, id: a.id });
      at =
        a.translationId === readingId
          ? { book: a.book, chapter: a.chapter }
          : (loc?.fromTranslation({ book: a.book, chapter: a.chapter, verse: a.startVerse }, a.translationId)?.ref ?? null);
      // Quoted in another translation, shown in the reader's: say which
      if (!pressed && readingAbbr && a.translationId !== readingId) readName = t("note.readPassageIn", { abbr: readingAbbr });
      if (chapter) snippet = anchorSnippet(chapter, a, SNIPPET_MAX);
      const home = abbrOf(a.translationId);
      // Written in another translation: say so (#159's "Skrevet i WEB")
      source = home && a.translationId !== readingId ? t("connections.writtenIn", { abbr: home }) : home;
      // The href stores canonical numbers: BPH Mal 3,23 → bible:MAL.4.5; a
      // psalm title alone (no English verse) → the whole psalm
      action = loc && (
        <button
          type="button"
          aria-label={`${t("note.insertInText")}, ${full}`}
          onClick={() => onInsertInText(loc.canonical(anchorRef(a), a.translationId) ?? { book: a.book, chapter: a.chapter })}
          className={actionClass}
        >
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
      row.kind === "marked" || onRemoveRef ? (
        <button
          type="button"
          aria-label={t("note.removeReferenceNamed", { ref: full })}
          title={t("note.removeReference")}
          onClick={() => (row.kind === "marked" ? void remove(row.anchor) : removeText(row))}
          className={cn(
            "inline-flex items-center justify-center rounded hover:text-destructive",
            on ? "text-accent-foreground" : "text-muted-foreground",
            mobile ? "size-11" : "size-6 pointer-coarse:size-11",
            focusRing,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : (
        <span />
      );

    // "denne side" / "s. 3" / "Rom 8" (spoken whole: "på side 3")
    const tag = refTag(locator, spotKey, at);
    const tagText =
      tag?.kind === "thisPage"
        ? t("note.tagThisPage")
        : tag?.kind === "page"
          ? t("note.tagPage", { page: tag.page })
          : tag?.kind === "chapter"
            ? chipLabel({ book: tag.book, chapter: tag.chapter }, locale)
            : "";
    const tagName =
      tag?.kind === "thisPage"
        ? t("note.tagThisPageName")
        : tag?.kind === "page"
          ? t("note.tagPageName", { page: tag.page })
          : tag?.kind === "chapter"
            ? t("note.tagChapterName", { ref: referenceLabel({ book: tag.book, chapter: tag.chapter }, nameOf, locale) })
            : "";
    const tagEl = tagText && (
      <span data-ref-tag="" className="whitespace-nowrap">
        <span aria-hidden>
          {source ? " · " : ""}
          {tagText}
        </span>
        <span className="sr-only">, {tagName}</span>
      </span>
    );

    const labelEl = <span className={cn("font-sans text-list font-medium whitespace-nowrap tabular-nums", blue)}>{label}</span>;
    // Quoted scripture: roman, never italic (Mads)
    const face = plain ? "font-sans" : "font-serif";
    const snippetEl = <span className={cn("min-w-0 truncate text-list", muted, face)}>{snippet}</span>;
    const sourceEl = (
      <span className={cn("font-sans text-meta whitespace-nowrap", muted)}>
        {source}
        {tagEl}
      </span>
    );

    return stacked ? (
      // Phone, or a narrow pane (large text): two lines (label · translation / snippet), fixed height
      <li key={row.key} className={cn("group flex items-center gap-1 rounded", pressed ? "bg-accent" : mobile ? "active:bg-accent" : "hover:bg-accent")}>
        <button
          type="button"
          data-row={row.key}
          data-spot-own=""
          aria-pressed={pressed}
          onClick={read}
          className={cn("flex h-13 min-w-0 flex-1 flex-col justify-center rounded px-1.5 text-left", focusRing)}
        >
          <span className="flex min-w-0 items-baseline gap-1.5">
            {labelEl}
            {(source || tagEl) && (
              <span className={cn("truncate font-sans text-meta", muted)}>
                · {source}
                {tagEl}
              </span>
            )}
          </span>
          <span className={cn("block h-5 min-w-0 truncate text-list", muted, face)}>{snippet}</span>
          <span className="sr-only">. {readName}</span>
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
          data-spot-own=""
          title={`${full}: ${readName}`}
          aria-pressed={pressed}
          onClick={read}
          className={cn("col-span-3 grid h-8 grid-cols-subgrid items-baseline rounded px-1.5 text-left pointer-coarse:h-11", focusRing)}
        >
          {/* Named by what it shows (label, words, translation), then what
              it does */}
          {labelEl}
          {snippetEl}
          <span className="flex items-baseline">
            {sourceEl}
            <span className="sr-only">. {readName}</span>
          </span>
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
      <ul aria-label={both ? undefined : t("note.references")} className={cn(!stacked && "col-span-full grid grid-cols-subgrid", stacked && "flex flex-col")}>
        {items.map(renderRow)}
      </ul>
    );
    // One shape either way (the subhead comes and goes): React keeps the
    // rows, and focus in them, when a group appears or empties
    return (
      <div
        key={title}
        role={both ? "group" : undefined}
        aria-label={both ? title : undefined}
        className={cn(!stacked && "col-span-full grid grid-cols-subgrid")}
      >
        {both && <h4 className="col-span-full px-1.5 pt-1.5 pb-0.5 font-sans text-meta text-muted-foreground">{title}</h4>}
        {list}
      </div>
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
            <div data-measure="body" className={cn(stacked && "pr-2.5")}>
              <div
                className={cn(
                  !stacked && "grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)_auto_auto_auto] gap-x-2.5",
                  stacked && "flex flex-col",
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
