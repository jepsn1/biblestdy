import type { Chapter } from "@biblestdy/shared";
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
import { atQuery, firstWords, verseOptions, type VerseOption } from "../notes/verse-resolver";
import { mergeRegister } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";
import { $insertScriptureRef } from "./scripture-ref-node";

/** The `@` being typed: where it sits and what follows it. */
type Match = { query: string; start: number; nodeKey: NodeKey; id: string };

/**
 * `@` + a reference inserts a chip (#160). Opens only at the start of a word
 * (emails untouched); the parsed match comes first and preselected, so one
 * Enter inserts it; book names follow below a hairline (Enter completes the
 * name). ↑↓ move, Enter/Tab insert, Esc — or a space with no hit — leaves
 * the typed text as it is. The menu sits inside the editor's scroll box
 * (never scrolling the reader behind it into view) and the editor is its
 * combobox: aria-controls/activedescendant on the text, the result spoken in
 * a live region.
 */
export function RefTypeahead() {
  const editor = useCellValue(rootEditor$);
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const qc = useQueryClient();
  const { mobile } = useContext(ScriptureRefContext);
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
        const m = atQuery(node.getTextContent().slice(0, sel.anchor.offset), locale);
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

  const options = useMemo(() => (match ? verseOptions(match.query, locale, 6) : []), [match, locale]);
  useEffect(() => setActive(0), [match?.query]);

  /** First words of a passage, if its chapter is in the cache already. */
  const wordsOf = (o: VerseOption) => {
    if (o.kind !== "ref") return "";
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
    const exact = stored ? qc.getQueryData<Chapter>(["chapter", stored, o.ref.book, o.ref.chapter]) : undefined;
    const any =
      exact ??
      (qc
        .getQueryCache()
        .findAll({ queryKey: ["chapter"] })
        .find((q) => q.queryKey[2] === o.ref.book && q.queryKey[3] === o.ref.chapter && q.state.data)?.state.data as Chapter | undefined);
    return firstWords(any, o.ref, 8);
  };

  function choose(o: VerseOption) {
    if (!editor || !match) return;
    const m = match;
    editor.update(() => {
      const node = $getNodeByKey(m.nodeKey);
      if (!$isTextNode(node)) return;
      const sel = $getSelection();
      const end = $isRangeSelection(sel) && sel.anchor.key === m.nodeKey ? sel.anchor.offset : m.start + 1 + m.query.length;
      const range = $createRangeSelection();
      range.anchor.set(m.nodeKey, o.kind === "ref" ? m.start : m.start + 1, "text");
      range.focus.set(m.nodeKey, end, "text");
      $setSelection(range);
      // A book: its name, then the chapter is typed — the menu stays open
      if (o.kind === "book") range.insertText(`${o.name} `);
      else $insertScriptureRef(o.href, chipLabel(o.ref, locale).replace(/ /g, " "));
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

  // Placed under the `@`, inside the editor's scroll box
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ host: HTMLElement; top: number; left: number } | null>(null);
  const placed = pos !== null;
  useLayoutEffect(() => {
    if (!editor || !match) {
      setPos(null);
      return;
    }
    const root = editor.getRootElement();
    const host = root?.closest<HTMLElement>(".mdxeditor");
    const textEl = editor.getElementByKey(match.nodeKey);
    const textNode = textEl?.firstChild;
    if (!host || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    const len = textNode.textContent?.length ?? 0;
    range.setStart(textNode, Math.min(match.start, len));
    range.setEnd(textNode, Math.min(match.start + 1, len));
    const at = range.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    const menu = menuRef.current;
    const w = menu?.offsetWidth ?? 288;
    const h = menu?.offsetHeight ?? 0;
    let top = at.bottom - box.top + host.scrollTop + 4;
    // No room below inside the box: above the line instead
    if (at.bottom + h + 4 > box.bottom && at.top - h - 4 > box.top) top = at.top - box.top + host.scrollTop - h - 4;
    const left = Math.max(4, Math.min(at.left - box.left + host.scrollLeft, host.clientWidth - w - 4));
    setPos((p) => (p && p.host === host && p.top === top && p.left === left ? p : { host, top, left }));
    // Again once the menu is drawn: its real size decides the side
  }, [editor, match, options, placed]);

  const activeOption = shown ? options[active] : undefined;
  const announce = !match
    ? ""
    : activeOption?.kind === "ref"
      ? t("note.typeaheadActive", { ref: referenceLabel(activeOption.ref, nameOf, locale) })
      : activeOption?.kind === "book"
        ? t("note.typeaheadBook", { book: activeOption.name })
        : match.query.trim()
          ? t("note.typeaheadNone", { q: match.query.trim() })
          : t("note.typeaheadHint");

  const refs = options.flatMap((o, i) => (o.kind === "ref" ? [{ o, i }] : []));
  const books = options.flatMap((o, i) => (o.kind === "book" ? [{ o, i }] : []));
  const row = (o: VerseOption, i: number) => {
    const words = wordsOf(o);
    return (
      // The editor keeps focus and the keys (aria-activedescendant): rows
      // are only pointed at, never focused
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
      <div
        key={o.kind === "ref" ? o.href : o.book}
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
        {o.kind === "ref" ? (
          <>
            <span className="font-sans font-medium whitespace-nowrap">{chipLabel(o.ref, locale)}</span>
            {words && <span className="min-w-0 truncate font-serif text-list text-muted-foreground">{words}</span>}
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
          <div
            ref={menuRef}
            className="absolute z-50 max-w-[min(24rem,calc(100%-0.5rem))] min-w-[min(18rem,calc(100%-0.5rem))] rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ top: pos.top, left: pos.left }}
          >
            {shown ? (
              <div role="listbox" id={listId} aria-label={t("note.typeaheadLabel")}>
                {refs.length > 0 && (
                  <div role="group" aria-label={t("note.typeaheadPassages")}>
                    {refs.map(({ o, i }) => row(o, i))}
                  </div>
                )}
                {books.length > 0 && (
                  <div role="group" aria-label={t("note.typeaheadBooks")} className={refs.length ? "mt-1 border-t border-border pt-1" : undefined}>
                    {books.map(({ o, i }) => row(o, i))}
                  </div>
                )}
              </div>
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
