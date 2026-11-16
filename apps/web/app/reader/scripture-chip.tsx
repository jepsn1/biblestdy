import { parseScriptureHref, resolveInChapter, toScriptureRef, type Chapter, type ScriptureRef, type Translation } from "@biblestdy/shared";
import { CANONICAL, mapRange } from "@biblestdy/shared/versification";
import { useQuery } from "@tanstack/react-query";
import { $getNodeByKey, $getSelection, $isNodeSelection, type BaseSelection, type LexicalEditor, type NodeKey } from "lexical";
import { ArrowRight } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bookLocale, useBookName } from "~/lib/book-name";
import { noteView } from "~/lib/fums";
import { ApiError, api } from "~/lib/query";
import { chipLabel, referenceLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { readingTranslationId } from "../notes/add-reference";
import { focusEditor } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";
import { $isScriptureRefNode, $restoreSelection, saveSelection } from "./scripture-ref-node";

/** Asks a chip to open its preview (Enter on a selected chip). */
const opens = new EventTarget();
export function requestOpenChip(key: NodeKey) {
  opens.dispatchEvent(new CustomEvent("open", { detail: key }));
}

/**
 * An inline reference as the note's reader sees it (#160): the label only,
 * in the UI language and font, gold as everything that navigates. A plain
 * click places the caret (writing comes first); a tap on touch, Enter when
 * selected, or Ctrl/⌘+click opens a preview of the verse in the reading
 * translation.
 */
export function ScriptureChip({ editor, nodeKey, href, text }: { editor: LexicalEditor; nodeKey: NodeKey; href: string; text: string }) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const ref = useMemo(() => parseScriptureHref(href), [href]);
  const label = ref ? chipLabel(ref, locale) : text;
  const full = ref ? referenceLabel(ref, nameOf, locale) : text;
  const [selected, setSelected] = useState(false);
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);
  const saved = useRef<BaseSelection | null>(null);
  const pointer = useRef("mouse");
  const { kit } = useContext(ScriptureRefContext);

  useEffect(() => {
    const read = () =>
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        setSelected($isNodeSelection(sel) && sel.has(nodeKey));
      });
    read();
    return editor.registerUpdateListener(read);
  }, [editor, nodeKey]);

  const openPreview = () => {
    if (!ref) return;
    saved.current = saveSelection(editor);
    setOpen(true);
  };
  const openRef = useRef(openPreview);
  useEffect(() => {
    openRef.current = openPreview;
  });
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<NodeKey>).detail === nodeKey) openRef.current();
    };
    opens.addEventListener("open", on);
    return () => opens.removeEventListener("open", on);
  }, [nodeKey]);

  /** Closing puts the caret back where it was (Esc, Kasper). */
  function close(restore: boolean) {
    setOpen(false);
    if (!restore) return;
    focusEditor(editor, () => $restoreSelection(saved.current));
  }

  /** A plain click: the caret on the nearer side of the chip. */
  function placeCaret(clientX: number) {
    const rect = chipRef.current?.getBoundingClientRect();
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isScriptureRefNode(node)) return;
      if (rect && clientX < rect.left + rect.width / 2) node.selectPrevious();
      else node.selectNext(0, 0);
    });
    focusEditor(editor);
  }

  return (
    <>
      {/* Keys reach a chip through the editor (ref-keys: Backspace selects,
          Enter opens) — it is text in a textbox, never a tab stop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <span
        ref={chipRef}
        title={t("note.refChipTitle", { ref: full, mod: kit.modKey() })}
        data-selected={selected || open ? "true" : undefined}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        onMouseDown={(e) => {
          if (pointer.current !== "mouse" || e.button !== 0) return;
          e.preventDefault();
          if (!(e.ctrlKey || e.metaKey)) placeCaret(e.clientX);
        }}
        // On click, not press: the press would count as outside the
        // preview that it opens
        onClick={(e) => {
          if (pointer.current !== "mouse" || e.ctrlKey || e.metaKey) openPreview();
        }}
        className={cn(
          // select-none: the browser never puts the caret inside the label
          // (a click below the text would, and typing there is lost).
          // Mads (#160): sans 500 at 0.875em (12px floor), gold text on an 8%
          // tint with a 22% inset hairline; lines never spread or break
          "cursor-pointer rounded-sm px-[0.3em] select-none font-sans text-[max(12px,0.875em)] leading-[inherit] font-medium whitespace-nowrap text-primary not-italic",
          "bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]",
          "hover:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]",
          // Selected/open: a 2px ring 1px off (a shadow — the editor resets outlines)
          "data-selected:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent),0_0_0_1px_var(--background),0_0_0_3px_var(--ring)]",
        )}
      >
        <span aria-hidden>{label}</span>
        <span className="sr-only">{t("note.refChipName", { ref: full })}</span>
      </span>
      {open && ref && (
        <RefPreview
          anchor={chipRef}
          scripture={ref}
          label={label}
          onClose={close}
          onRemove={() => {
            setOpen(false);
            editor.update(() => {
              const node = $getNodeByKey(nodeKey);
              if (!$isScriptureRefNode(node)) return;
              node.selectPrevious();
              node.remove();
            });
            focusEditor(editor);
          }}
        />
      )}
    </>
  );
}

/** The reading translation's id: this device's choice, else resolved. */
function useReadingTranslationId(): string | undefined {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
  const { data } = useQuery({ queryKey: ["reading-translation-id"], queryFn: readingTranslationId, enabled: !stored, staleTime: Infinity });
  return stored ?? data;
}

/** Verses at most shown (~10 lines, then a fade). */
const PREVIEW_MAX = "16em";

/**
 * The chip's preview (#160, Mads): the verse text in the translation being
 * read, labelled with it ("Num 21,4–9 · BPH"); a bridge says what it spans
 * ("· i BPH 3,14–15"); a chapter this translation lacks says so plainly,
 * never a guess. The chapter loads only now (a FUMS view when shown).
 */
function RefPreview({
  anchor,
  scripture,
  label,
  onClose,
  onRemove,
}: {
  anchor: React.RefObject<HTMLSpanElement | null>;
  scripture: ScriptureRef;
  label: string;
  onClose: (restore: boolean) => void;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const { onRead, mobile, kit } = useContext(ScriptureRefContext);
  const { Popover, PopoverContent } = kit;
  const readRef = useRef<HTMLButtonElement>(null);
  const translationId = useReadingTranslationId();
  const translations = useQuery({
    queryKey: ["translations"],
    queryFn: () => api<Translation[]>("/api/translations"),
    staleTime: Infinity,
  });
  const chapter = useQuery({
    queryKey: ["chapter", translationId, scripture.book, scripture.chapter],
    queryFn: () => api<Chapter>(`/api/passages/${translationId}/${scripture.book}/${scripture.chapter}`),
    enabled: !!translationId,
    staleTime: 60 * 60 * 1000, // scripture text is immutable
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const token = chapter.data?.fumsToken;
  useEffect(() => {
    if (token) noteView(token);
  }, [token]);

  const current = translations.data?.find((tr) => tr.id === translationId);
  const abbr = current?.abbreviation ?? "";
  const missing = chapter.error instanceof ApiError && chapter.error.status === 404;
  const at = chapter.data ? resolveInChapter(scripture, chapter.data) : missing ? "notInTranslation" : null;
  const resolved = at && at !== "notInTranslation" ? at : null;
  const notHere = at === "notInTranslation";
  // Numbered differently here (#166's map: English Mal 4 is BPH Mal
  // 3,19–24): say where, and read it there
  const renumbered = useMemo(() => {
    if (!notHere || !abbr) return null;
    const slices = mapRange(scripture, CANONICAL, abbr);
    const first = slices[0];
    const last = slices[slices.length - 1];
    if (!first || slices.some((sl) => sl.kind !== "renumbered" && sl.kind !== "moved")) return null;
    return toScriptureRef({ book: first.book, chapter: first.chapter, verse: first.startVerse, endChapter: last.chapter, endVerse: last.endVerse });
  }, [notHere, abbr, scripture]);
  // Else the canonical (English-numbered) translation, offered where this
  // one lacks the place — never a guess at a neighbour
  const elsewhere = notHere && !renumbered ? translations.data?.find((tr) => tr.abbreviation === "WEB" && tr.id !== translationId) : undefined;
  const sep = locale === "da" ? "," : ":";
  const verses = resolved && chapter.data ? chapter.data.verses.filter((v) => v.verse >= resolved.startVerse && v.verse <= resolved.endVerse) : [];

  const actionClass = cn("inline-flex items-center gap-1 rounded-sm text-list font-medium", mobile ? "min-h-11 px-2" : "min-h-7 px-1.5", focusRing);

  return (
    <Popover open onOpenChange={(o, details) => !o && onClose(details.reason !== "outside-press")}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        initialFocus={readRef}
        finalFocus={false}
        aria-label={`${label.replace(/ /g, " ")}${abbr ? ` · ${abbr}` : ""}`}
        className="w-max max-w-[min(22rem,calc(100vw-2rem))] gap-2 px-3.5 py-3 motion-reduce:animate-none"
      >
        <p className="text-list">
          <span className="font-medium text-foreground">{label}</span>
          {abbr && !resolved?.bridged && <span className="text-muted-foreground"> · {abbr}</span>}
          {abbr && resolved?.bridged && (
            <span className="text-muted-foreground">
              {" "}
              · {t("note.refIn", { abbr, ref: `${scripture.chapter}${sep}${resolved.printedStart}–${resolved.printedEnd}` })}
            </span>
          )}
        </p>
        {notHere ? (
          <p className="text-list text-muted-foreground">
            {t("note.refNotIn", { ref: referenceLabel(scripture, nameOf, locale), abbr })}
            {renumbered && ` ${t("note.refNumberedAs", { abbr, ref: chipLabel(renumbered, locale).replace(/–/g, "\u2060–\u2060") })}`}
          </p>
        ) : chapter.isError ? (
          <p className="text-list text-muted-foreground">{t("note.refPreviewFailed")}</p>
        ) : !resolved ? (
          <p className="text-list text-muted-foreground">{t("note.refLoading")}</p>
        ) : (
          <p
            className="overflow-hidden font-serif text-control leading-[1.6] text-foreground"
            style={{
              maxHeight: PREVIEW_MAX,
              maskImage: `linear-gradient(to bottom, black calc(${PREVIEW_MAX} - 2.5em), transparent ${PREVIEW_MAX})`,
            }}
          >
            {verses.map((v) => (
              <span key={v.verse}>
                <sup className="mr-0.5 text-[0.7em] text-muted-foreground">{v.label ?? v.verse}</sup>
                {v.text}{" "}
              </span>
            ))}
          </p>
        )}
        <div className="-mx-1.5 flex items-center justify-between gap-3">
          {notHere ? (
            renumbered ? (
              <button
                ref={readRef}
                type="button"
                className={cn(actionClass, "text-primary")}
                onClick={() => {
                  onClose(false);
                  onRead?.(renumbered);
                }}
              >
                {t("note.readRef", { ref: chipLabel(renumbered, locale) })}
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : elsewhere ? (
              <button
                ref={readRef}
                type="button"
                className={cn(actionClass, "text-primary")}
                onClick={() => {
                  onClose(false);
                  onRead?.(scripture, elsewhere.id);
                }}
              >
                {t("note.readIn", { abbr: elsewhere.abbreviation })}
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span />
            )
          ) : (
            <button
              ref={readRef}
              type="button"
              className={cn(actionClass, "text-primary")}
              onClick={() => {
                onClose(false);
                onRead?.(scripture);
              }}
            >
              {t("note.readHere")}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
          <button type="button" className={cn(actionClass, "text-muted-foreground hover:text-foreground")} onClick={onRemove}>
            {t("note.removeRef")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
