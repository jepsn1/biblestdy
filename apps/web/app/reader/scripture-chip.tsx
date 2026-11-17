import { formatScriptureHref, parseScriptureHref, resolveInChapter, type Chapter, type MarkLink, type ScriptureRef, type Translation } from "@biblestdy/shared";
import { localRef } from "@biblestdy/shared/versification";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { $getNodeByKey, $getSelection, $isNodeSelection, type BaseSelection, type LexicalEditor, type NodeKey } from "lexical";
import { ArrowRight } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bookLocale, useBookName } from "~/lib/book-name";
import { noteView } from "~/lib/fums";
import { ApiError, api } from "~/lib/query";
import { chipLabel, referenceLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { useReadingTranslationId } from "../notes/add-reference";
import { focusEditor } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";
import { chipOpensOnClick } from "./chip-click";
import { hoverRef, spotParam, useRefHover, useRefSpot } from "./spotlight";
import { $isScriptureRefNode, $restoreSelection, saveSelection } from "./scripture-ref-node";
import { MarkGlyph } from "./mark-row";
import { useMarkStateWords, useRefMarkState, type RefMarkState } from "./ref-mark";

/** Asks a chip to open its preview (Enter on a selected chip), or (#213,
 * Alt+Enter) to show it in the Bible straight away. */
const opens = new EventTarget();
export function requestOpenChip(key: NodeKey, spotlight = false) {
  opens.dispatchEvent(new CustomEvent("open", { detail: { key, spotlight } }));
}

const translationsQuery = {
  queryKey: ["translations"],
  queryFn: () => api<Translation[]>("/api/translations"),
  staleTime: Infinity,
};

/**
 * An inline reference as the note's reader sees it (#160): the label only,
 * in the UI language and font, in the note's ink (#213: one relation, one
 * colour — the bracket on the page is blue too). A click or tap opens a
 * preview of the verse in the reading translation, the caret after the
 * chip (#213 C6; a drag that starts on it is no click); Enter on a
 * selected chip opens it too, Alt+Enter spotlights it in the Bible at once.
 * Hover — or selecting it — lights its link on the page; the page's hover
 * on that link outlines it here (hoverRef, spotlight.ts).
 *
 * Tagged with a mark (#216): a small glyph before the label — the
 * highlight's swatch or the pen's stroke as the mark is now; a hollow ring
 * when it can't follow (erased, another translation), said in its name and
 * the preview.
 */
export function ScriptureChip({
  editor,
  nodeKey,
  href,
  text,
  mark = null,
}: {
  editor: LexicalEditor;
  nodeKey: NodeKey;
  href: string;
  text: string;
  mark?: MarkLink | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const ref = useMemo(() => parseScriptureHref(href), [href]);
  const canonical = useMemo(() => (ref && formatScriptureHref(ref)) ?? null, [ref]);
  const label = ref ? chipLabel(ref, locale) : text;
  const full = ref ? referenceLabel(ref, nameOf, locale) : text;
  const [selected, setSelected] = useState(false);
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);
  const saved = useRef<BaseSelection | null>(null);
  const pointer = useRef("mouse");
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const { kit, onRead, page, noteRefs } = useContext(ScriptureRefContext);
  const queryClient = useQueryClient();
  const translationId = useReadingTranslationId();
  const markStateOf = useRefMarkState(page, noteRefs, translationId);
  const markState = mark && ref ? markStateOf(ref, mark) : null;
  const markWords = useMarkStateWords();
  const stateWords = markState ? markWords(markState) : "";
  const hovered = useRefHover();
  const spot = useRefSpot();
  const outlined = !!canonical && hovered?.from === "page" && hovered.keys.includes(canonical);
  const spotlit = !!canonical && !!spot?.startsWith("ref:") && spotParam(spot) === canonical;

  useEffect(() => {
    const read = () =>
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        setSelected($isNodeSelection(sel) && sel.has(nodeKey));
      });
    read();
    return editor.registerUpdateListener(read);
  }, [editor, nodeKey]);

  // A chip leaving the text (removed, note closed) takes its hover along
  useEffect(() => () => hoverRef(null), []);

  // Selected by the keyboard: its link lights on the page, as on hover
  useEffect(() => {
    if (!selected || !canonical) return;
    hoverRef({ from: "note", keys: [canonical] });
    return () => hoverRef(null);
  }, [selected, canonical]);

  const openPreview = () => {
    if (!ref) return;
    saved.current = saveSelection(editor);
    setOpen(true);
  };
  /** Alt+Enter: "Show in Bible" without the preview — where the reading
   * translation has it (its numbers, #163), as the preview's button does. */
  const spotlight = async () => {
    if (!ref || !onRead) return;
    const list = await queryClient.fetchQuery(translationsQuery).catch(() => undefined);
    const abbr = list?.find((tr) => tr.id === translationId)?.abbreviation;
    const local = abbr ? localRef(ref, abbr) : undefined;
    onRead(ref, local?.ref ?? ref);
  };
  const openRef = useRef({ openPreview, spotlight });
  useEffect(() => {
    openRef.current = { openPreview, spotlight };
  });
  useEffect(() => {
    const on = (e: Event) => {
      const { key, spotlight: spot } = (e as CustomEvent<{ key: NodeKey; spotlight: boolean }>).detail;
      if (key !== nodeKey) return;
      if (spot) void openRef.current.spotlight();
      else openRef.current.openPreview();
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

  /** A click: the caret right after the chip — where typing goes on once
   * the preview closes (#213 C6). */
  function caretAfter() {
    // Discrete: the preview saves this selection to put back on Esc
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isScriptureRefNode(node)) node.selectNext(0, 0);
      },
      { discrete: true },
    );
  }

  return (
    <>
      {/* Keys reach a chip through the editor (ref-keys: Backspace selects,
          Enter opens) — it is text in a textbox, never a tab stop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <span
        ref={chipRef}
        title={t("note.refChipTitle", { ref: full, alt: kit.modKey() === "⌘" ? "⌥" : "Alt+" })}
        data-selected={selected || open ? "true" : undefined}
        data-hover={outlined || undefined}
        data-spot={spotlit || undefined}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        onPointerEnter={() => canonical && hoverRef({ from: "note", keys: [canonical] })}
        onPointerLeave={() => !selected && hoverRef(null)}
        onMouseDown={(e) => {
          if (pointer.current !== "mouse" || e.button !== 0) return;
          // No caret inside the label; the click decides (below)
          e.preventDefault();
          pressedAt.current = { x: e.clientX, y: e.clientY };
        }}
        // On click, not press: the press would count as outside the
        // preview that it opens
        onClick={(e) => {
          const mouse = pointer.current === "mouse";
          const from = pressedAt.current;
          pressedAt.current = null;
          if (!chipOpensOnClick({ mouse, button: e.button, from, to: { x: e.clientX, y: e.clientY } })) return;
          if (mouse) caretAfter();
          openPreview();
        }}
        className={cn(
          // select-none: the browser never puts the caret inside the label
          // (a click below the text would, and typing there is lost).
          // Mads (#160): sans 500 at 0.875em (12px floor); #213: the note's
          // ink — transparent, a 45% hairline, --note-ink-text (4.5:1 in
          // both themes); lines never spread or break
          "cursor-pointer rounded-sm px-[0.3em] select-none font-sans text-[max(12px,0.875em)] leading-[inherit] font-medium whitespace-nowrap text-(--note-ink-text) not-italic",
          "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--note-ink)_45%,transparent)]",
          "hover:bg-(--link-wash)",
          // Spotlit in the Bible: the strong wash, as on the page
          "data-spot:bg-(--link-wash-strong)",
          // Its link hovered on the page: outlined (a shape, not a colour)
          "data-hover:shadow-[inset_0_0_0_1.5px_var(--note-ink)]",
          // Selected/open: a 2px ring 1px off (a shadow — the editor resets outlines)
          "data-selected:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--note-ink)_45%,transparent),0_0_0_1px_var(--background),0_0_0_3px_var(--ring)]",
        )}
      >
        {markState &&
          (markState.state === "live" ? (
            <MarkGlyph kind={markState.kind} className="mr-[0.3em] inline-block size-[0.7em] align-[-0.05em]" />
          ) : (
            <span aria-hidden className="mr-[0.3em] inline-block size-[0.7em] rounded-full align-[-0.05em] ring-1 ring-current ring-inset opacity-70" />
          ))}
        <span aria-hidden>{label}</span>
        <span className="sr-only">
          {stateWords ? t("note.refChipMark", { ref: full, state: stateWords }) : t("note.refChipName", { ref: full })}
        </span>
      </span>
      {open && ref && (
        <RefPreview
          anchor={chipRef}
          scripture={ref}
          label={label}
          markState={markState}
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
  markState,
  onClose,
  onRemove,
}: {
  anchor: React.RefObject<HTMLSpanElement | null>;
  scripture: ScriptureRef;
  label: string;
  /** Tagged with a mark (#216): its state, said when it can't follow. */
  markState: RefMarkState | null;
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
  const current = translations.data?.find((tr) => tr.id === translationId);
  const abbr = current?.abbreviation ?? "";
  // The stored (English) numbers where this translation has them (#163:
  // Mal 4,2 is BPH Mal 3,20); undefined until the list is in, null = no
  // counterpart (Neh 7,68 in BPH) — never the same number instead
  const local = useMemo(() => (translations.data ? localRef(scripture, abbr) : undefined), [translations.data, scripture, abbr]);
  const at0 = local?.ref ?? scripture;
  const chapter = useQuery({
    queryKey: ["chapter", translationId, at0.book, at0.chapter],
    queryFn: () => api<Chapter>(`/api/passages/${translationId}/${at0.book}/${at0.chapter}`),
    enabled: !!translationId && !!local,
    staleTime: 60 * 60 * 1000, // scripture text is immutable
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const token = chapter.data?.fumsToken;
  useEffect(() => {
    if (token) noteView(token);
  }, [token]);

  const missing = chapter.error instanceof ApiError && chapter.error.status === 404;
  const at =
    local === null ? "notInTranslation" : local && chapter.data ? resolveInChapter(local.ref, chapter.data) : missing ? "notInTranslation" : null;
  const resolved = at && at !== "notInTranslation" ? at : null;
  const notHere = at === "notInTranslation";
  // The canonical (English-numbered) translation, offered where this one
  // lacks the place — never a guess at a neighbour
  const elsewhere = notHere ? translations.data?.find((tr) => tr.abbreviation === "WEB" && tr.id !== translationId) : undefined;
  const sep = locale === "da" ? "," : ":";
  // Numbered differently here, or a bridge: say where ("· i BPH 3,20")
  const where =
    resolved && local && (resolved.bridged || local.renumbered)
      ? `${local.ref.chapter}${sep}${resolved.printedEnd > resolved.printedStart ? `${resolved.printedStart}–${resolved.printedEnd}` : resolved.printedStart}`
      : null;
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
          {abbr && !where && <span className="text-muted-foreground"> · {abbr}</span>}
          {abbr && where && (
            <span className="text-muted-foreground">
              {" "}
              · {t("note.refIn", { abbr, ref: where })}
            </span>
          )}
        </p>
        {markState && <MarkStateLine state={markState} />}
        {notHere ? (
          <p className="text-list text-muted-foreground">
            {t("note.refNotIn", { ref: referenceLabel(scripture, nameOf, locale), abbr })}
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
            elsewhere ? (
              <button
                ref={readRef}
                type="button"
                className={cn(actionClass, "text-(--note-ink-text)")}
                onClick={() => {
                  onClose(false);
                  onRead?.(scripture, scripture, elsewhere.id);
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
              className={cn(actionClass, "text-(--note-ink-text)")}
              onClick={() => {
                onClose(false);
                // Where this translation has it (BPH Mal 3,20, not Mal 4,2)
                onRead?.(scripture, local?.ref ?? scripture);
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

/** The preview's line about the mark: what it is, or why the whole verse. */
function MarkStateLine({ state }: { state: RefMarkState }) {
  const { t } = useTranslation();
  const words = useMarkStateWords();
  const translations = useQuery(translationsQuery).data;
  if (state.state === "live")
    return (
      <p className="flex items-center gap-1.5 font-sans text-meta text-muted-foreground">
        <MarkGlyph kind={state.kind} />
        {words(state)}
      </p>
    );
  const text =
    state.state === "removed"
      ? t("note.refMarkRemoved")
      : state.state === "elsewhere"
        ? t("note.refMarkElsewhere", { abbr: translations?.find((tr) => tr.id === state.translationId)?.abbreviation ?? state.translationId })
        : "";
  return text ? <p className="font-sans text-meta text-muted-foreground">{text}</p> : null;
}
