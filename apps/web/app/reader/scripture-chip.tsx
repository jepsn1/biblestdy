import { formatScriptureHref, parseScriptureHref, resolveInChapter, type Chapter, type MarkLink, type ScriptureRef, type Translation } from "@biblestdy/shared";
import { localRef } from "@biblestdy/shared/versification";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { $getNodeByKey, $getSelection, $isNodeSelection, type BaseSelection, type LexicalEditor, type NodeKey } from "lexical";
import { ArrowRight, X } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bookLocale, useBookName } from "~/lib/book-name";
import { noteView } from "~/lib/fums";
import { hideKeyboard } from "~/lib/native-touch";
import { ApiError, api } from "~/lib/query";
import { chipLabel, referenceLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { useReadingTranslationId } from "../notes/add-reference";
import { focusEditor } from "./lexical-util";
import { ScriptureRefContext, type EditorKit } from "./ref-context";
import { chipOpensOnClick, touchStayed, touchTapOpens } from "./chip-click";
import { hoverRef, spotParam, useRefHover, useRefSpot } from "./spotlight";
import { $isScriptureRefNode, $restoreSelection, saveSelection } from "./scripture-ref-node";
import { MarkGlyph } from "./mark-row";
import { useMarkStateWords, useRefMarkState, type RefMarkState } from "./ref-mark";

/** When anything last scrolled (event time): a finger landing on a chip
 * right after stops the scroll, it doesn't open it (chip-click). */
let lastScrollAt = -Infinity;
if (typeof document !== "undefined")
  document.addEventListener("scroll", (e) => void (lastScrollAt = e.timeStamp), { capture: true, passive: true });

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
 * highlight's swatch or the pen's stroke as the mark is now; a broken ring
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
  const touchedAt = useRef<{ x: number; y: number; t: number; sinceScroll: number } | null>(null);
  /** When a finger's tap opened it (event time): a stray click after it
   * is the same tap. Not the pointer type: VoiceOver's double tap is a
   * bare click, and must open after a real touch too. */
  const liftAt = useRef(-Infinity);
  /** Phones (#281): the note was being written in when the chip was
   * pressed — closing the drawer gives the caret (and keyboard) back; a
   * note only being read keeps the keyboard down. */
  const writingAtPress = useRef(false);
  const writing = useRef(false);
  const { kit, onRead, page, noteRefs, mobile } = useContext(ScriptureRefContext);
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

  // Phones: the drawer's code in before the first tap (the Notes page
  // mounts none of its own, Jonas)
  const { preloadDrawer } = kit;
  useEffect(() => {
    if (mobile) preloadDrawer();
  }, [mobile, preloadDrawer]);

  // A chip leaving the text (removed, note closed) takes its hover along
  useEffect(() => () => hoverRef(null), []);

  // Selected by the keyboard: its link lights on the page, as on hover
  useEffect(() => {
    if (!selected || !canonical) return;
    hoverRef({ from: "note", keys: [canonical] });
    return () => hoverRef(null);
  }, [selected, canonical]);

  const openPreview = (fromPress = false) => {
    if (!ref) return;
    saved.current = saveSelection(editor);
    if (mobile) {
      const root = editor.getRootElement();
      writing.current = fromPress ? writingAtPress.current : !!root?.contains(document.activeElement);
      // The keyboard never covers the drawer (#281): down while it's open
      hideKeyboard();
    }
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

  // Phones (#281 panel, Elias): a chip low in a long note would open under
  // its drawer — the note scrolls it into sight above, and back on close
  const scrolled = useRef<{ el: HTMLElement; top: number; pad: string } | null>(null);
  useEffect(() => {
    if (!open || !mobile) return;
    const chip = chipRef.current;
    const id = window.setTimeout(() => {
      const drawer = [...document.querySelectorAll<HTMLElement>('[data-slot="drawer-popup"]')].at(-1);
      const pane = chip && scrollPane(chip);
      if (!chip || !drawer || !pane || drawer.contains(chip)) return;
      const over = chip.getBoundingClientRect().bottom - (drawer.getBoundingClientRect().top - 16);
      if (over <= 0) return;
      // A chip on the last lines: room below the text to scroll it up
      // (under the drawer, unseen), taken back on close
      const room = over - (pane.scrollHeight - pane.clientHeight - pane.scrollTop);
      const pad = pane.style.paddingBottom;
      if (room > 0) pane.style.paddingBottom = `calc(${getComputedStyle(pane).paddingBottom} + ${Math.ceil(room)}px)`;
      scrolled.current = { el: pane, top: pane.scrollTop, pad };
      pane.scrollBy({ top: over, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 480); // the drawer's slide (drawer.tsx: 450ms)
    return () => {
      window.clearTimeout(id);
      const back = scrolled.current;
      scrolled.current = null;
      if (!back?.el.isConnected) return;
      back.el.style.paddingBottom = back.pad;
      back.el.scrollTo({ top: back.top });
    };
  }, [open, mobile]);

  /** Closing puts the caret back where it was (Esc, Kasper). */
  function close(restore: boolean) {
    setOpen(false);
    // Phones: only back into a note that was being written in
    if (!restore || (mobile && !writing.current)) return;
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
          // Before the tap moves focus into the text
          writingAtPress.current = !!editor.getRootElement()?.contains(document.activeElement);
        }}
        // A finger opens at the lift (#281, chip-click: the press may move
        // the chip from under it); no click follows, so the note isn't
        // focused — no keyboard for a note only being read, the caret
        // where it was for one being written
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchedAt.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, t: e.timeStamp, sinceScroll: e.timeStamp - lastScrollAt } : null;
        }}
        onTouchEnd={(e) => {
          const from = touchedAt.current;
          touchedAt.current = null;
          const t = e.changedTouches[0];
          // Every finger's lift: no click after it opens (Jonas F1)
          liftAt.current = e.timeStamp;
          if (!t || !from) return;
          const to = { x: t.clientX, y: t.clientY };
          // Stayed put (a tap, a long press): no focus, caret or click
          if (touchStayed(from, to)) e.preventDefault();
          if (touchTapOpens({ from, to, ms: e.timeStamp - from.t, sinceScroll: from.sinceScroll })) openPreview(true);
        }}
        onTouchCancel={() => {
          touchedAt.current = null;
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
          // A finger's lift decided already (above)
          if (e.timeStamp - liftAt.current < 800) return;
          // VoiceOver / a keyboard's activation: a bare click (detail 0,
          // no press before it) opens it, the caret left alone (Jonas F2)
          if (e.detail === 0) {
            openPreview();
            return;
          }
          const mouse = pointer.current === "mouse";
          const from = pressedAt.current;
          pressedAt.current = null;
          if (!chipOpensOnClick({ mouse, button: e.button, from, to: { x: e.clientX, y: e.clientY } })) return;
          if (mouse) caretAfter();
          openPreview(true);
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
            // Can't follow: a broken ring (never mistaken for the pen's circle)
            <svg aria-hidden viewBox="0 0 12 12" className="mr-[0.3em] inline-block size-[0.7em] align-[-0.05em]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2.2">
              <circle cx="6" cy="6" r="4.6" />
            </svg>
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
            // Phones: the keyboard stays down for a note only being read
            if (!mobile || writing.current) focusEditor(editor);
          }}
        />
      )}
    </>
  );
}

/** The note's scroller around a chip: the nearest ancestor that scrolls. */
function scrollPane(el: HTMLElement): HTMLElement | null {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const y = getComputedStyle(a).overflowY;
    if ((y === "auto" || y === "scroll") && a.scrollHeight > a.clientHeight) return a;
  }
  return null;
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

  // Phones (#281 panel, Freja/Sofie/Birthe): the book's full name in the
  // drawer — where a reader finds out what "Sl" is; the chip stays short
  const named = mobile ? referenceLabel(scripture, nameOf, locale) : label;
  const title = (
    <>
      {/* One unit, never broken at its dash (#281 panel) */}
      <span className="font-medium whitespace-nowrap text-foreground">{named}</span>
      {abbr && !where && <span className="text-muted-foreground"> · {abbr}</span>}
      {abbr && where && (
        <span className="text-muted-foreground">
          {" "}
          · {t("note.refIn", { abbr, ref: where })}
        </span>
      )}
    </>
  );
  const ariaLabel = `${label.replace(/\u00a0/g, " ")}${abbr ? ` · ${abbr}` : ""}`;
  // Spoken (#281 panel, Birthe/Elias): the full name and the translation's
  // name, not "S L … dot W E B"
  const spoken = `${named.replace(/\u00a0/g, " ")}${current ? `, ${current.name}` : ""}`;
  const verseText = verses.map((v) => (
    <span key={v.verse}>
      <sup className="mr-0.5 text-[0.7em] text-muted-foreground">{v.label ?? v.verse}</sup>
      {v.text}{" "}
    </span>
  ));
  const status = notHere ? (
    <p className="text-list text-muted-foreground">{t("note.refNotIn", { ref: referenceLabel(scripture, nameOf, locale), abbr })}</p>
  ) : chapter.isError ? (
    <p className="text-list text-muted-foreground">{t("note.refPreviewFailed")}</p>
  ) : !resolved ? (
    <p className="text-list text-muted-foreground">{t("note.refLoading")}</p>
  ) : null;
  const read = () => {
    onClose(false);
    // Where this translation has it (BPH Mal 3,20, not Mal 4,2)
    onRead?.(scripture, local?.ref ?? scripture);
  };
  const readElsewhere = () => {
    if (!elsewhere) return;
    onClose(false);
    onRead?.(scripture, scripture, elsewhere.id);
  };

  if (mobile) return <RefDrawer {...{ kit, title, ariaLabel: spoken, closeName: named, markState, status, verseText, readRef, onClose, onRemove }} read={notHere ? (elsewhere ? readElsewhere : null) : read} readLabel={notHere && elsewhere ? t("note.readIn", { abbr: elsewhere.abbreviation }) : t("note.readHere")} />;

  const actionClass = cn("inline-flex min-h-7 items-center gap-1 rounded-sm px-1.5 text-list font-medium", focusRing);
  return (
    <Popover open onOpenChange={(o, details) => !o && onClose(details.reason !== "outside-press")}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        initialFocus={readRef}
        finalFocus={false}
        aria-label={ariaLabel}
        className="w-max max-w-[min(22rem,calc(100vw-2rem))] gap-2 px-3.5 py-3 motion-reduce:animate-none"
      >
        <p className="text-list">{title}</p>
        {markState && <MarkStateLine state={markState} />}
        {status ?? (
          <p
            className="overflow-hidden font-serif text-control leading-[1.6] text-foreground"
            style={{
              maxHeight: PREVIEW_MAX,
              maskImage: `linear-gradient(to bottom, black calc(${PREVIEW_MAX} - 2.5em), transparent ${PREVIEW_MAX})`,
            }}
          >
            {verseText}
          </p>
        )}
        <div className="-mx-1.5 flex items-center justify-between gap-3">
          {notHere ? (
            elsewhere ? (
              <button ref={readRef} type="button" className={cn(actionClass, "text-(--note-ink-text)")} onClick={readElsewhere}>
                {t("note.readIn", { abbr: elsewhere.abbreviation })}
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span />
            )
          ) : (
            <button ref={readRef} type="button" className={cn(actionClass, "text-(--note-ink-text)")} onClick={read}>
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

/**
 * The preview on phones (#281, owner: a drawer, not a popover): the same
 * content in a bottom drawer over the note. The note's sheet stays as it is
 * (its DrawerContent `stack={false}`); the content clears the home
 * indicator and the glass's corners (drawer.tsx: `--corner-bottom`);
 * every control 44px or more, with a pressed state. A dialog named by its
 * title; focus on "Show in Bible"; Esc, a swipe down, a tap above it or
 * Close end it — the caret back where it was (close(true)).
 */
function RefDrawer({
  kit,
  title,
  ariaLabel,
  closeName,
  markState,
  status,
  verseText,
  readRef,
  read,
  readLabel,
  onClose,
  onRemove,
}: {
  kit: EditorKit;
  title: React.ReactNode;
  /** Spoken: the full name and the translation's. */
  ariaLabel: string;
  /** The reference alone, for Close's name ("Close Psalm 23:1–4"). */
  closeName: string;
  markState: RefMarkState | null;
  status: React.ReactNode;
  verseText: React.ReactNode;
  readRef: React.RefObject<HTMLButtonElement | null>;
  /** null: nowhere to read it (not in this translation, nor in WEB). */
  read: (() => void) | null;
  readLabel: string;
  onClose: (restore: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { Drawer, DrawerContent, DrawerTitle, ScrollArea } = kit;
  const pressable = "touch-manipulation transition-colors duration-100 motion-reduce:transition-none";
  return (
    <Drawer open onOpenChange={(o) => !o && onClose(true)} showSwipeHandle>
      <DrawerContent
        initialFocus={read ? readRef : undefined}
        finalFocus={false}
        aria-label={ariaLabel}
        // A layer of its own over the note (#281 panel, 6/6): the note
        // dimmed, never blurred (its chip and words stay readable) — a
        // nested drawer's backdrop renders only when forced — and a lifted
        // edge; dark's near-black needs the deeper dim
        overlay="force"
        overlayClassName="bg-black/20 dark:bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="shadow-[0_-6px_20px_rgb(0_0_0/0.08)] [--drawer-content-max-height:min(92dvh,calc(100dvh-var(--safe-top)-1rem))] dark:shadow-[0_-6px_20px_rgb(0_0_0/0.45)]"
      >
        <header className="flex min-h-[52px] shrink-0 items-center gap-2 pt-1 pr-2 pl-4">
          <DrawerTitle className="min-w-0 flex-1 font-sans text-phone">{title}</DrawerTitle>
          <button
            type="button"
            aria-label={t("note.refClose", { ref: closeName.replace(/\u00a0/g, " ") })}
            onClick={() => onClose(true)}
            className={cn("inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-control font-medium text-foreground hover:bg-accent active:bg-accent", pressable, focusRing)}
          >
            <X aria-hidden className="size-[1.125rem]" />
            <span>{t("note.closeShort")}</span>
          </button>
        </header>
        {markState && (
          <div className="shrink-0 px-4 pb-1">
            <MarkStateLine state={markState} />
          </div>
        )}
        {status ? (
          <div className="shrink-0 px-4 py-2">{status}</div>
        ) : (
          <ScrollArea className="min-h-0" viewportClassName="max-h-[min(45dvh,20rem)] overscroll-contain">
            <p className="px-4 pt-1 pb-3 font-serif text-reading leading-[1.6] text-foreground select-text">{verseText}</p>
          </ScrollArea>
        )}
        {/* Large text on a narrow phone: Remove wraps under the primary,
            from the left (#281 panel, Mads) */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 pt-2.5 pb-2.5">
          {read && (
            <button
              ref={readRef}
              type="button"
              onClick={read}
              className={cn(
                "inline-flex min-h-[48px] min-w-0 py-1.5 flex-[1_1_10rem] items-center justify-center gap-1.5 rounded-lg bg-(--link-wash) px-4 text-phone whitespace-nowrap font-medium text-(--note-ink-text) active:bg-(--link-wash-strong)",
                pressable,
                focusRing,
              )}
            >
              {readLabel}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "-mr-2 inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-phone font-medium whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground",
              !read && "flex-1",
              pressable,
              focusRing,
            )}
          >
            {t("note.removeRef")}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
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
