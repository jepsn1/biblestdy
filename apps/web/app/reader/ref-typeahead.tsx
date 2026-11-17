import type { Chapter, Translation } from "@biblestdy/shared";
import { localRef } from "@biblestdy/shared/versification";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import { useQueryClient } from "@tanstack/react-query";
import {
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type NodeKey,
} from "lexical";
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { bookLocale, useBookName } from "~/lib/book-name";
import { chipLabel, referenceLabel } from "~/lib/reference-label";
import { cn } from "~/lib/utils";
import { filterMarks, type PageMark } from "../notes/page-marks";
import { atQuery, firstWords, verseOptions, type VerseOption } from "../notes/verse-resolver";
import { mergeRegister } from "./lexical-util";
import { MarkRow } from "./mark-row";
import { ScriptureRefContext } from "./ref-context";
import { $insertScriptureRef } from "./scripture-ref-node";
import { useMarkKind, usePageMarks } from "./use-page-marks";

/** A row: a passage marked on the page (#191), or a typed match. */
type Option = { kind: "mark"; mark: PageMark } | VerseOption;

/** A group's visible name ("In this chapter", "All verses"). */
const groupHead = "px-2 pt-1 pb-0.5 font-sans text-meta font-medium text-muted-foreground";

/** The `@` being typed: where it sits and what follows it. */
type Match = { query: string; start: number; nodeKey: NodeKey; id: string };

/**
 * `@` + a reference inserts a chip (#160). Opens only at the start of a word
 * (emails untouched); the parsed match comes first and preselected, so one
 * Enter inserts it; book names follow below a hairline (Enter completes the
 * name). ↑↓ move, Enter/Tab insert, Esc — or a space with no hit — leaves
 * the typed text as it is. The menu sits in the note's panel (never
 * scrolling the reader behind it into view) and the editor is its
 * combobox: aria-controls/activedescendant on the text, the result spoken in
 * a live region.
 *
 * Beside the reader, the passages marked on the open chapter lead (#191):
 * all of them, in reading order, on a bare `@`; typing filters them (verse
 * number, reference, their words or how they're marked) above the general
 * matches. A whole reference typed stays preselected (one Enter inserts it)
 * unless it is a mark itself.
 */
export function RefTypeahead() {
  const editor = useCellValue(rootEditor$);
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const qc = useQueryClient();
  const { mobile, kit } = useContext(ScriptureRefContext);
  const { ScrollArea } = kit;
  const marks = usePageMarks();
  const markKind = useMarkKind();
  // The caret listener reads these without re-registering
  const marksNow = useRef({ marks, markKind });
  useEffect(() => {
    marksNow.current = { marks, markKind };
  });
  const listId = useId();
  const [match, setMatch] = useState<Match | null>(null);
  const [active, setActive] = useState(0);
  const dismissed = useRef<string | null>(null);

  // Follow the caret: a fresh `@query` opens, anything else closes
  useEffect(() => {
    if (!editor) return;
    const read = () => {
      if (editor.isComposing()) return;
      const next = editor.getEditorState().read((): Match | null => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed() || sel.anchor.type !== "text") return null;
        const node = sel.anchor.getNode();
        if (!$isTextNode(node) || !node.isSimpleText() || node.hasFormat("code")) return null;
        const { marks, markKind } = marksNow.current;
        const m = atQuery(node.getTextContent().slice(0, sel.anchor.offset), locale, (q) =>
          filterMarks(marks, q, locale, markKind).length > 0,
        );
        if (!m) return null;
        return { ...m, nodeKey: node.getKey(), id: `${node.getKey()}:${m.start}` };
      });
      if (!next) dismissed.current = null;
      const open = next && next.id !== dismissed.current ? next : null;
      setMatch((prev) => (prev?.id === open?.id && prev?.query === open?.query ? prev : open));
    };
    return mergeRegister(
      editor.registerUpdateListener(read),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setMatch(null);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, locale]);

  const { options, initial } = useMemo(() => {
    if (!match) return { options: [] as Option[], initial: 0 };
    const onPage = filterMarks(marks, match.query, locale, markKind);
    const taken = new Set(onPage.map((m) => m.href));
    const typed = verseOptions(match.query, locale, 6);
    const general = typed.filter((o) => o.kind !== "ref" || !taken.has(o.href));
    // A whole reference typed ("joh 3,16") that no mark is: still one
    // Enter inserts it, the marks above it or not
    const exact = typed[0]?.kind === "ref" && !typed[0].fuzzy && /\p{L}/u.test(match.query) && /\d/.test(match.query);
    const initial = exact && general[0] === typed[0] ? onPage.length : 0;
    return { options: [...onPage.map((mark): Option => ({ kind: "mark", mark })), ...general], initial };
  }, [match, locale, marks, markKind]);
  useEffect(() => setActive(initial), [match?.query]); // eslint-disable-line react-hooks/exhaustive-deps -- per query

  /** First words of a passage, if its chapter is in the cache already —
   * where that translation numbers it (#163: Mal 4,2 is BPH Mal 3,20). */
  const wordsOf = (o: Option) => {
    if (o.kind !== "ref") return "";
    const translations = qc.getQueryData<Translation[]>(["translations"]);
    if (!translations) return "";
    const here = (id: unknown) => localRef(o.ref, translations.find((tr) => tr.id === id)?.abbreviation ?? "")?.ref;
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
    const cached = qc.getQueryCache().findAll({ queryKey: ["chapter"] });
    const hit = [...cached]
      .sort((a, b) => Number(b.queryKey[1] === stored) - Number(a.queryKey[1] === stored))
      .map((q) => ({ q, at: here(q.queryKey[1]) }))
      .find(({ q, at }) => at && q.queryKey[2] === at.book && q.queryKey[3] === at.chapter && q.state.data);
    return hit?.at ? firstWords(hit.q.state.data as Chapter, hit.at, 8) : "";
  };

  function choose(o: Option) {
    if (!editor || !match) return;
    const m = match;
    editor.update(() => {
      const node = $getNodeByKey(m.nodeKey);
      if (!$isTextNode(node)) return;
      const sel = $getSelection();
      const end = $isRangeSelection(sel) && sel.anchor.key === m.nodeKey ? sel.anchor.offset : m.start + 1 + m.query.length;
      const range = $createRangeSelection();
      range.anchor.set(m.nodeKey, o.kind === "book" ? m.start + 1 : m.start, "text");
      range.focus.set(m.nodeKey, end, "text");
      $setSelection(range);
      // A book: its name, then the chapter is typed — the menu stays open
      if (o.kind === "book") range.insertText(`${o.name} `);
      else {
        const ref = o.kind === "mark" ? o.mark.ref : o.ref;
        // A mark picked: the chip is tagged with it (#216), a live link
        $insertScriptureRef(
          o.kind === "mark" ? o.mark.href : o.href,
          chipLabel(ref, locale).replace(/ /g, " "),
          o.kind === "mark" ? o.mark.mark : null,
        );
      }
    });
  }

  // Keys while open (before the editor's own: Enter must not split the line)
  const state = useRef({ match, options, active, choose });
  useEffect(() => {
    state.current = { match, options, active, choose };
  });
  useEffect(() => {
    if (!editor || !match) return;
    const move = (by: number) => (event: KeyboardEvent | null) => {
      const { options } = state.current;
      if (options.length === 0) return false;
      event?.preventDefault();
      setActive((i) => (i + by + options.length) % options.length);
      return true;
    };
    const pick = (event: KeyboardEvent | null) => {
      const { options, active, choose } = state.current;
      const o = options[active];
      if (!o) return false;
      event?.preventDefault();
      choose(o);
      return true;
    };
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, move(1), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, move(-1), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ENTER_COMMAND, pick, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_TAB_COMMAND, pick, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          // The typed text stays; the panel doesn't close on this Esc
          event.preventDefault();
          event.stopPropagation();
          dismissed.current = state.current.match?.id ?? null;
          setMatch(null);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- re-register per opening

  // The editor is the combobox: it points at the list and its active row
  const shown = match !== null && options.length > 0;
  const optionId = (i: number) => `${listId}-o${i}`;
  useEffect(() => {
    const root = editor?.getRootElement();
    if (!root || !shown) return;
    root.setAttribute("aria-autocomplete", "list");
    root.setAttribute("aria-controls", listId);
    root.setAttribute("aria-activedescendant", optionId(active));
    return () => {
      root.removeAttribute("aria-autocomplete");
      root.removeAttribute("aria-controls");
      root.removeAttribute("aria-activedescendant");
    };
  });

  // Placed under the `@`, in the note's panel: below the line it may cover
  // what's under the editor (the references, the footer) down to the
  // panel's foot — on a short screen (large text, a phone: #196) the
  // editor's own box holds barely a row. Never above the editor's top.
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ host: HTMLElement; top: number; left: number; maxH: number } | null>(null);
  const placed = pos !== null;
  const [scrolled, setScrolled] = useState(0);
  useLayoutEffect(() => {
    if (!editor || !match) {
      setPos(null);
      return;
    }
    const root = editor.getRootElement();
    const box = root?.closest<HTMLElement>(".mdxeditor");
    // The panel (positioned); the editor's box where there is none
    const host = box?.closest<HTMLElement>("aside") ?? box;
    const textEl = editor.getElementByKey(match.nodeKey);
    const textNode = textEl?.firstChild;
    if (!box || !host || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    const len = textNode.textContent?.length ?? 0;
    range.setStart(textNode, Math.min(match.start, len));
    range.setEnd(textNode, Math.min(match.start + 1, len));
    const at = range.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const edBox = box.getBoundingClientRect();
    // The `@` scrolled out of the editor's sight: no menu till it's back
    if (at.bottom <= edBox.top || at.top >= edBox.bottom) {
      setPos(null);
      return;
    }
    // Down to the panel's foot — or the on-screen keyboard's top
    const vv = window.visualViewport;
    const floor = Math.min(frame.bottom, vv ? vv.offsetTop + vv.height : frame.bottom);
    const ceiling = Math.max(edBox.top, frame.top);
    const menu = menuRef.current;
    const w = menu?.offsetWidth ?? 288;
    const h = menu?.offsetHeight ?? 0;
    const inHost = host === box ? host.scrollTop : 0;
    let top = at.bottom - frame.top + inHost + 4;
    // No room below: above the line instead
    if (at.bottom + h + 4 > floor && at.top - h - 4 > ceiling) top = at.top - frame.top + inHost - h - 4;
    const left = Math.max(4, Math.min(at.left - frame.left + (host === box ? host.scrollLeft : 0), host.clientWidth - w - 4));
    // A long list scrolls within the roomier side of the line, never past
    // it (20: the menu's padding, gap and a margin)
    const maxH = Math.max(88, Math.round(Math.max(floor - at.bottom, at.top - ceiling) - 20));
    setPos((p) => (p && p.host === host && p.top === top && p.left === left && p.maxH === maxH ? p : { host, top, left, maxH }));
    // Again once the menu is drawn: its real size decides the side
  }, [editor, match, options, placed, scrolled]);
  // The editor scrolls (or the keyboard comes) under an open menu: follow
  const open = match !== null;
  useEffect(() => {
    const box = editor?.getRootElement()?.closest<HTMLElement>(".mdxeditor");
    if (!open || !box) return;
    const again = () => setScrolled((n) => n + 1);
    const vv = window.visualViewport;
    box.addEventListener("scroll", again, { passive: true });
    window.addEventListener("resize", again);
    vv?.addEventListener("resize", again);
    return () => {
      box.removeEventListener("scroll", again);
      window.removeEventListener("resize", again);
      vv?.removeEventListener("resize", again);
    };
  }, [editor, open]);

  // The active row stays in sight — the menu's own scroll, never the page's
  const viewportRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const el = shown ? document.getElementById(optionId(active)) : null;
    if (!vp || !el) return;
    // The first row: its group's heading too
    const top = active === 0 ? 0 : el.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop;
    if (top < vp.scrollTop) vp.scrollTop = top;
    else if (top + el.offsetHeight > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + el.offsetHeight - vp.clientHeight;
  });

  const activeOption = shown ? options[active] : undefined;
  const announce = !match
    ? ""
    : activeOption?.kind === "mark"
      ? t("note.typeaheadMark", { ref: referenceLabel(activeOption.mark.ref, nameOf, locale), kind: markKind(activeOption.mark) })
      : activeOption?.kind === "ref"
      ? t("note.typeaheadActive", { ref: referenceLabel(activeOption.ref, nameOf, locale) })
      : activeOption?.kind === "book"
        ? t("note.typeaheadBook", { book: activeOption.name })
        : match.query.trim()
          ? t("note.typeaheadNone", { q: match.query.trim() })
          : t("note.typeaheadHint");

  const marked = options.flatMap((o, i) => (o.kind === "mark" ? [{ o, i }] : []));
  const refs = options.flatMap((o, i) => (o.kind === "ref" ? [{ o, i }] : []));
  const books = options.flatMap((o, i) => (o.kind === "book" ? [{ o, i }] : []));
  const row = (o: Option, i: number) => {
    const words = o.kind === "mark" ? "" : wordsOf(o);
    return (
      // The editor keeps focus and the keys (aria-activedescendant): rows
      // are only pointed at, never focused
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
      <div
        key={o.kind === "mark" ? `m:${o.mark.href}` : o.kind === "ref" ? o.href : o.book}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        // Keep the caret in the note
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
        onMouseMove={() => i !== active && setActive(i)}
        className={cn(
          "flex min-h-8 cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5 text-list pointer-coarse:min-h-11",
          mobile && "min-h-11",
          i === active && "bg-accent text-accent-foreground",
        )}
      >
        {o.kind === "mark" ? (
          <MarkRow mark={o.mark} locale={locale} kind={markKind(o.mark)} active={i === active} />
        ) : o.kind === "ref" ? (
          <>
            <span className="font-sans font-medium whitespace-nowrap">{chipLabel(o.ref, locale)}</span>
            {/* On the active row's tint the muted grey falls short of 4.5:1 (#196) */}
            {words && <span className={cn("min-w-0 truncate font-serif text-list", i === active ? "text-accent-foreground" : "text-muted-foreground")}>{words}</span>}
          </>
        ) : (
          <span className="font-sans">{o.name}</span>
        )}
      </div>
    );
  };

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
      {match &&
        pos &&
        createPortal(
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- only keeps the caret in the note
          <div
            ref={menuRef}
            // Keep the caret in the note (the scrollbar too)
            onMouseDown={(e) => e.preventDefault()}
            className="absolute z-50 max-w-[min(24rem,calc(100%-0.5rem))] min-w-[min(18rem,calc(100%-0.5rem))] rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ top: pos.top, left: pos.left, "--menu-max": `${pos.maxH}px` } as React.CSSProperties}
          >
            {shown ? (
              <ScrollArea viewportRef={viewportRef} viewportClassName="max-h-[min(20rem,50dvh,var(--menu-max))]">
                <div role="listbox" id={listId} aria-label={t("note.typeaheadLabel")}>
                  {marked.length > 0 && (
                    <div role="group" aria-labelledby={`${listId}-page`}>
                      <div id={`${listId}-page`} role="presentation" className={groupHead}>
                        {t("note.typeaheadOnPage")}
                      </div>
                      {marked.map(({ o, i }) => row(o, i))}
                    </div>
                  )}
                  {refs.length > 0 && (
                    <div
                      role="group"
                      aria-labelledby={marked.length ? `${listId}-all` : undefined}
                      aria-label={marked.length ? undefined : t("note.typeaheadPassages")}
                      className={marked.length ? "mt-1 border-t border-border pt-1" : undefined}
                    >
                      {marked.length > 0 && (
                        <div id={`${listId}-all`} role="presentation" className={groupHead}>
                          {t("note.typeaheadAll")}
                        </div>
                      )}
                      {refs.map(({ o, i }) => row(o, i))}
                    </div>
                  )}
                  {books.length > 0 && (
                    <div role="group" aria-label={t("note.typeaheadBooks")} className={refs.length || marked.length ? "mt-1 border-t border-border pt-1" : undefined}>
                      {books.map(({ o, i }) => row(o, i))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <p aria-hidden className="px-2 py-1.5 text-list text-muted-foreground">
                {announce}
              </p>
            )}
          </div>,
          pos.host,
        )}
    </>
  );
}
