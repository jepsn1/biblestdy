import { useTranslation } from "react-i18next";
import type { Anchor, Chapter, Note, Highlight, HighlightColor, Annotation, WordPos } from "@biblestdy/shared";
import {
  anchorReference,
  buildAnchor,
  DEFAULT_HIGHLIGHT_COLOR,
  formatReference,
  HIGHLIGHT_COLORS,
  words,
  wordRangeInVerse,
} from "@biblestdy/shared";
import { FileText, X } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authClient } from "~/lib/auth-client";
import { cn, focusRing } from "~/lib/utils";
import { AnnotationEditor } from "./annotation-editor";
import { formatCopy } from "./copy-attribution";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE, NOTE_INK_WASH } from "./highlight-colors";
import { lineOf, type Rect } from "./ink-geometry";
import {
  ActionMenu,
  ActionMenuColors,
  ActionMenuItem,
  ActionMenuSeparator,
  AnchoredPanel,
  SELECTION_UI_ATTR,
  type VirtualAnchor,
} from "./selection-menu";
import type { NoteMark } from "./use-notes";
import { NOTE_OPENER } from "./note-panel";
import { layoutChapter, type WordPiece } from "./chapter-layout";

function isColor(value: unknown): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}

/** What the action menu is open for. */
type MenuState =
  /** A fresh word selection (drag on desktop, tap + handles on phones). */
  | { kind: "selection"; anchor: Anchor }
  /** An existing highlight, opened from the word at `at`. */
  | { kind: "highlight"; highlight: Highlight; at: WordPos }
  /** Writing an annotation for the selection. */
  | { kind: "compose"; anchor: Anchor }
  /** Picking an existing note to anchor to the selection too. */
  | { kind: "attach"; anchor: Anchor }
  | null;

// Marked spans carry no inline decoration — AnnotationMarks draws a hand-drawn
// ink loop around [data-annotation-anchor] spans plus the placed box + arrow.

/** Annotations and notes (markdown docs) share the anchor pipeline; note ids
 * are namespaced "note:<id>" so clicks/marks can tell them apart. */
type AnchorRef = { id: string };
type WordSeg = { annotation: AnchorRef | null; words: WordPiece[] };

/** Split a verse piece's words into runs of the same anchored mark (null = unmarked). */
function groupByAnnotation(
  verse: number,
  pieces: WordPiece[],
  annotationCoverage: Map<string, AnchorRef>,
): WordSeg[] {
  const segs: WordSeg[] = [];
  for (const w of pieces) {
    const annotation = annotationCoverage.get(`${verse}:${w.i}`) ?? null;
    const last = segs[segs.length - 1];
    if (last && (last.annotation?.id ?? null) === (annotation?.id ?? null)) last.words.push(w);
    else segs.push({ annotation, words: [w] });
  }
  return segs;
}

function coverInto<T>(
  map: Map<string, T>,
  verses: Chapter["verses"],
  items: (Anchor & { value: T })[],
) {
  for (const v of verses) {
    const count = words(v.text).length;
    for (const it of items) {
      const range = wordRangeInVerse(it, v.verse, count);
      if (!range) continue;
      for (let w = range.start; w <= range.end; w++) {
        const key = `${v.verse}:${w}`;
        if (!map.has(key)) map.set(key, it.value);
      }
    }
  }
}

/** DOMRect fields are prototype getters — spread/JSON see nothing. */
const plain = (r: DOMRect): Rect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

const EMPTY_RECT = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };

export function ChapterText({
  chapter,
  translationAbbreviation,
  heading,
  highlights,
  annotations,
  noteMarks,
  allNotes,
  otherVersionCounts,
  activeAnnotationId,
  selectedMarkId,
  onAddHighlight,
  onRecolorHighlight,
  onRemoveHighlight,
  onAddAnnotation,
  onEditAnnotation,
  onRemoveAnnotation,
  onAddNote,
  onAttachNote,
  onOpenNote,
  onFocusAnnotation,
  onSelectionChange,
  inlineAnnotations = false,
  firstUseHint = false,
  onDismissHint,
  mobile = false,
}: {
  chapter: Chapter;
  /** Shown in the reference line of copied text, e.g. "(NIV)". */
  translationAbbreviation: string;
  heading: string;
  highlights: Highlight[];
  annotations: Annotation[];
  noteMarks: NoteMark[];
  /** Every note of the user — the attach-an-existing-note picker. */
  allNotes: Note[];
  /** verse -> count of the user's notes on OTHER translations (#11). */
  otherVersionCounts: Map<number, number>;
  activeAnnotationId: string | null;
  /** Mark of the reference selected in the note panel — the rest of the page
   * dims slightly so the spotlight state is legible. */
  selectedMarkId: string | null;
  onAddHighlight: (anchor: Anchor, color: HighlightColor) => void;
  onRecolorHighlight: (id: string, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddAnnotation: (anchor: Anchor, text: string) => void;
  onEditAnnotation: (id: string, text: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onAddNote: (anchor: Anchor) => void;
  onAttachNote: (noteId: string, anchor: Anchor) => void;
  onOpenNote: (id: string) => void;
  onFocusAnnotation: (id: string | null) => void;
  /** The live selection (wash painted by HighlightMarks, behind the text). */
  onSelectionChange: (anchor: Anchor | null) => void;
  /** No margin lanes (phones with boxes on, narrow desktop panes): each
   * annotation prints as a line under its verse — in the flow, never over
   * the text (#63). */
  inlineAnnotations?: boolean;
  /** "Select words to highlight…" under the heading until first use (#63). */
  firstUseHint?: boolean;
  onDismissHint?: () => void;
  /** Phone (#13): native selection is disabled — tapping a word selects it,
   * the menu opens immediately, and two drag handles stretch the span. Note
   * marks show as a small marker after the verse number (#63). */
  mobile?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  // Tap-selection (mobile): a = the end fixed at tap, b = the dragged end.
  // Either handle may drag either end; buildAnchor normalizes the order.
  const [touchSel, setTouchSel] = useState<{ a: WordPos; b: WordPos } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const defaultColor: HighlightColor = isColor(session?.user.defaultHighlightColor)
    ? session.user.defaultHighlightColor
    : DEFAULT_HIGHLIGHT_COLOR;
  const passage = { translationId: chapter.translationId, book: chapter.book, chapter: chapter.chapter };

  // Marks and highlights may overlap/nest (a circled or re-marked word inside
  // a larger span) — cover smallest span first so the most specific one wins
  // clicks + wash. Rendering measures each mark's own word range regardless.
  const spanSize = (a: Anchor) => (a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord);
  const hlCoverage = new Map<string, Highlight>();
  coverInto(
    hlCoverage,
    chapter.verses,
    [...highlights].sort((a, b) => spanSize(a) - spanSize(b)).map((h) => ({ ...h, value: h })),
  );
  const annotationCoverage = new Map<string, AnchorRef>();
  coverInto(
    annotationCoverage,
    chapter.verses,
    [
      ...annotations.map((n) => ({ ...n, value: { id: n.id } })),
      // Per-anchor identity — a note anchored twice here is two distinct marks
      ...noteMarks.map((m) => ({ ...m, value: { id: `note:${m.noteId}:${m.id}` } })),
    ].sort((a, b) => spanSize(a) - spanSize(b)),
  );

  // The selection as an anchor (normalized: either end may pass the other)
  const selAnchor = useMemo(
    () => (touchSel ? buildAnchor(passage, touchSel.a, touchSel.b) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- passage is derived from chapter
    [touchSel, chapter.translationId, chapter.book, chapter.chapter],
  );
  useEffect(() => onSelectionChange(selAnchor), [selAnchor, onSelectionChange]);

  // Handle positions, measured from the boundary words (fixed/viewport coords
  // — getBoundingClientRect sees through the sheet's scale transform)
  const [handleRects, setHandleRects] = useState<{ start: DOMRect; end: DOMRect } | null>(null);
  useLayoutEffect(() => {
    if (!selAnchor || !mobile || !rootRef.current) {
      setHandleRects(null);
      return;
    }
    const startEl = wordEl(selAnchor.startVerse, selAnchor.startWord);
    const endEl = wordEl(selAnchor.endVerse, selAnchor.endWord);
    if (startEl && endEl)
      setHandleRects({
        start: startEl.getBoundingClientRect(),
        end: endEl.getBoundingClientRect(),
      });
  }, [selAnchor, mobile]);

  const spotlight =
    selectedMarkId != null &&
    noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId);

  const dragSel = useRef<{ start: WordPos; moved: boolean } | null>(null);

  /** Where focus was when a menu opened (inside the text, e.g. #65's verse
   * focus) — a keyboard close returns there, else to the text itself. */
  const opener = useRef<HTMLElement | null>(null);
  const hadMenu = useRef(false);
  if (!!menu !== hadMenu.current) {
    hadMenu.current = !!menu;
    if (menu && typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      opener.current = active && rootRef.current?.closest("#chapter-text")?.contains(active) ? active : null;
    }
  }

  /** A menu item that opens a follow-up (Annotate → composer) parks it
   * here: the menu's own close then hands over instead of clearing. */
  const nextMenu = useRef<MenuState>(null);
  useEffect(() => {
    if (menu?.kind === "compose" || menu?.kind === "attach") nextMenu.current = null;
  }, [menu]);

  /** Menu gone → its selection goes too (unless a new drag already started). */
  function closeMenu(keyboard = false) {
    if (nextMenu.current) {
      setMenu(nextMenu.current);
      nextMenu.current = null;
      return;
    }
    setMenu(null);
    if (!dragSel.current) setTouchSel(null);
    if (keyboard) {
      const target =
        opener.current ?? rootRef.current?.closest<HTMLElement>("#chapter-text") ?? null;
      // preventScroll: the paged sheet is overflow-clipped, a scroll would shift it
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
  }

  const chapterKey = `${chapter.translationId}/${chapter.book}.${chapter.chapter}`;
  useEffect(() => {
    setMenu(null);
    setTouchSel(null);
    setEditingId(null);
  }, [chapterKey]);

  function wordEl(verse: number, word: number) {
    return rootRef.current?.querySelector<HTMLElement>(`[data-verse="${verse}"][data-word="${word}"]`);
  }

  /** Word rects of an anchor (layout + transform aware, viewport px). */
  function anchorRects(a: Anchor): Rect[] {
    const out: Rect[] = [];
    for (let v = a.startVerse; v <= a.endVerse; v++) {
      const els = rootRef.current?.querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`) ?? [];
      for (const el of els) {
        const w = Number(el.dataset.word);
        if ((v === a.startVerse && w < a.startWord) || (v === a.endVerse && w > a.endWord)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0) out.push(plain(r));
      }
    }
    return out;
  }

  /** The menu's anchor: the selected line the menu belongs to — the end
   * word's line for a selection, the tapped word's line for a highlight.
   * Read live, so the menu follows handle drags and reflow. */
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const virtualAnchor = useMemo<VirtualAnchor>(
    () => ({
      getBoundingClientRect: () => {
        const m = menuRef.current;
        if (!m) return DOMRect.fromRect(EMPTY_RECT);
        const anchor = m.kind === "highlight" ? m.highlight : m.anchor;
        const at = m.kind === "highlight" ? m.at : { verse: anchor.endVerse, word: anchor.endWord };
        const el = wordEl(at.verse, at.word);
        if (!el) return DOMRect.fromRect(EMPTY_RECT);
        const line = lineOf(anchorRects(anchor), plain(el.getBoundingClientRect()));
        return new DOMRect(line.left, line.top, line.right - line.left, line.bottom - line.top);
      },
    }),
    [],
  );

  // Phone: the drawer covers the lower screen — scroll the selection above it
  const menuOpen = menu !== null;
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const timer = window.setTimeout(() => {
      const drawer = document.querySelector(`[data-slot="drawer-popup"][${SELECTION_UI_ATTR}]`);
      const vp = rootRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!drawer || !vp) return;
      const covered = virtualAnchor.getBoundingClientRect().bottom + 12 - drawer.getBoundingClientRect().top;
      if (covered > 0) vp.scrollBy({ top: covered, behavior: "smooth" });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [mobile, menuOpen, virtualAnchor]);

  // Copy (⌘C / Ctrl+C) while a selection's menu is up: native selection is
  // off, so the browser has nothing to copy — supply the selected words plus
  // reference + copyright line (#27). Selection itself is untouched.
  const copyAnchor =
    menu?.kind === "selection" || menu?.kind === "attach"
      ? menu.anchor
      : menu?.kind === "highlight"
        ? menu.highlight
        : null;
  useEffect(() => {
    if (!copyAnchor) return;
    const onCopy = (e: ClipboardEvent) => {
      // A real text selection elsewhere (e.g. an input) keeps native copy
      const native = window.getSelection();
      if (native && !native.isCollapsed) return;
      if (!e.clipboardData) return;
      const { text, html } = formatCopy(chapter, copyAnchor, translationAbbreviation);
      e.clipboardData.setData("text/plain", text);
      e.clipboardData.setData("text/html", html);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [copyAnchor, chapter, translationAbbreviation]);

  async function copyAnchorText(anchor: Anchor) {
    const { text, html } = formatCopy(chapter, anchor, translationAbbreviation);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } catch {
      // No ClipboardItem/rich write (older webviews) — plain text still carries the citation
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function wordPosOf(target: EventTarget | null): WordPos | null {
    const el = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-verse][data-word]");
    if (!el || !rootRef.current?.contains(el)) return null;
    return { verse: Number(el.dataset.verse), word: Number(el.dataset.word) };
  }

  /** Desktop drag-select: native selection is off everywhere (no half words
   * possible) — a mouse drag paints the same word-snapped wash the phone
   * handles do, and the release opens the menu. */
  function onPointerDown(event: React.PointerEvent) {
    if (mobile || event.button !== 0) return;
    const pos = wordPosOf(event.target);
    if (!pos) return;
    dragSel.current = { start: pos, moved: false };
    // Instant feedback: the pressed word washes immediately. A no-drag
    // release discards it (see onPointerUp) — click semantics stay intact.
    if (!menuRef.current) setTouchSel({ a: pos, b: pos });
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragSel.current;
    if (!drag || event.buttons !== 1) return;
    const pos = wordPosOf(event.target);
    if (!pos) return;
    if (!drag.moved && pos.verse === drag.start.verse && pos.word === drag.start.word) return;
    if (!drag.moved) setMenu(null); // a new selection replaces whatever was open
    drag.moved = true;
    setTouchSel({ a: drag.start, b: pos });
  }

  /** Release: a drag opens the selection menu; a press without drag (or a
   * phone tap) is a click on the word. Pointer events, not click: the words
   * are not controls — keyboard selection is #65's verse focus. */
  function onPointerUp(event: React.PointerEvent) {
    const drag = dragSel.current;
    dragSel.current = null;
    if (drag?.moved) {
      setTouchSel((sel) => {
        if (sel) setMenu({ kind: "selection", anchor: buildAnchor(passage, sel.a, sel.b) });
        return sel;
      });
      return;
    }
    if (drag && !menuRef.current) setTouchSel(null); // press without drag = a click
    if (event.button !== 0) return;
    const pos = wordPosOf(event.target);
    if (pos) onWordClick(event, pos);
  }

  function onWordClick(event: React.PointerEvent, pos: WordPos) {
    const markId = annotationCoverage.get(`${pos.verse}:${pos.word}`)?.id;
    const hit = hlCoverage.get(`${pos.verse}:${pos.word}`);
    if (markId?.startsWith("note:")) {
      event.stopPropagation();
      onOpenNote(markId.split(":")[1]); // "note:<noteId>:<anchorId>" — open the note panel
      return;
    }
    if (markId) {
      event.stopPropagation();
      onFocusAnnotation(markId); // highlight the matching placed annotation
      return;
    }
    if (hit) {
      event.stopPropagation();
      setTouchSel(null);
      setMenu({ kind: "highlight", highlight: hit, at: pos });
      return;
    }
    if (!mobile) {
      closeMenu();
      return;
    }
    // Tap-select: one word selected, menu up immediately, handles stretch it
    event.stopPropagation();
    setTouchSel({ a: pos, b: pos });
    setMenu({ kind: "selection", anchor: buildAnchor(passage, pos, pos) });
  }

  /** Drag one end of the tap-selection: the word under the pointer becomes
   * that end; anchor + menu follow live. Ends may cross — the pair is
   * re-normalized so the handles never swap roles mid-drag. */
  function dragHandle(which: "start" | "end", clientX: number, clientY: number) {
    const hit = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-verse][data-word]");
    if (!hit || !rootRef.current?.contains(hit)) return;
    const pos = { verse: Number(hit.dataset.verse), word: Number(hit.dataset.word) };
    setTouchSel((sel) => {
      if (!sel) return sel;
      const before = (x: WordPos, y: WordPos) =>
        x.verse < y.verse || (x.verse === y.verse && x.word <= y.word);
      const [start, end] = before(sel.a, sel.b) ? [sel.a, sel.b] : [sel.b, sel.a];
      const next = which === "start" ? { a: pos, b: end } : { a: start, b: pos };
      const anchor = buildAnchor(passage, next.a, next.b);
      setMenu((m) => (m?.kind === "selection" ? { ...m, anchor } : m));
      return next;
    });
  }

  function addHighlight(anchor: Anchor, color: HighlightColor) {
    onAddHighlight(anchor, color);
    if (color !== defaultColor) void authClient.updateUser({ defaultHighlightColor: color });
  }

  function saveDraft(keyboard = false) {
    const text = draft.trim();
    if (text && menu?.kind === "compose") onAddAnnotation(menu.anchor, text);
    closeMenu(keyboard);
  }

  // Inline ink (#63): annotation lines print after their END verse; note
  // markers (phones) after the verse number of the mark's START verse.
  const linesByVerse = new Map<number, Annotation[]>();
  if (inlineAnnotations)
    for (const a of [...annotations].sort((x, y) => x.startVerse - y.startVerse || x.startWord - y.startWord))
      linesByVerse.set(a.endVerse, [...(linesByVerse.get(a.endVerse) ?? []), a]);
  const markersByVerse = new Map<number, NoteMark[]>();
  if (mobile)
    for (const m of noteMarks) markersByVerse.set(m.startVerse, [...(markersByVerse.get(m.startVerse) ?? []), m]);
  const blocks = layoutChapter(chapter);
  // Last piece of each verse (a verse can run over several poetry lines)
  const lastPiece = new Map<number, string>();
  blocks.forEach((b, bi) => b.pieces.forEach((p, pi) => lastPiece.set(p.verse.verse, `${bi}:${pi}`)));

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      data-spotlight={spotlight || undefined}
      // Native selection is off for everyone — selections are word-snapped by
      // construction (drag wash on desktop, tap + handles on phones)
      className="select-none [-webkit-touch-callout:none]"
    >
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{heading}</h1>
      {firstUseHint && (
        <p
          data-first-use-hint
          className="mb-6 flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 font-sans text-sm text-muted-foreground [break-inside:avoid]"
        >
          {t(mobile ? "reader.firstUseHintPhone" : "reader.firstUseHint")}
          <button
            type="button"
            aria-label={t("reader.dismissHint")}
            title={t("reader.dismissHint")}
            onClick={onDismissHint}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-foreground",
              focusRing,
            )}
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}
      {blocks.map((block, bi) => (
        <Fragment key={bi}>
          {block.headings.map((title) => (
            // Editorial heading: a quiet book-style subhead, never anchorable
            <h2
              key={title}
              data-section
              className={`mb-[0.4em] font-serif text-[0.95em] leading-snug font-semibold text-muted-foreground [break-after:avoid] ${
                bi === 0 ? "mt-0" : "mt-[1.6em]"
              }`}
            >
              {title}
            </h2>
          ))}
          <p
            data-block={block.kind}
            className={block.stanza ? "mt-[0.85em]" : undefined}
            style={
              block.kind === "poetry"
                ? // Hanging indent: q1 at 1em, q2 at 2em…; a wrapped line sits
                  // 2em deeper so it never reads as the next poetry line
                  { paddingLeft: `${block.level + 2}em`, textIndent: "-2em" }
                : block.kind === "paragraph" && !block.opening
                  ? { textIndent: "1em" }
                  : undefined
            }
          >
            {block.pieces.map((piece, pi) => {
              const v = piece.verse;
              const lines = lastPiece.get(v.verse) === `${bi}:${pi}` ? linesByVerse.get(v.verse) : undefined;
              return (
                <span key={`${v.verse}:${piece.words[0]?.i ?? 0}`}>
                  {piece.showNumber && (
                    // Small, muted verse number; zero line-height so it never
                    // opens a gap in the leading. Bridges print "14–15".
                    <sup className="mr-1 align-[0.5em] font-sans text-[0.58em] leading-[0] font-medium text-muted-foreground tabular-nums select-none">
                      {v.label ?? v.verse}
                    </sup>
                  )}
                  {piece.showNumber &&
                    markersByVerse.get(v.verse)?.map((m) => (
                      // Phone note marker: never over the text — it IS text-flow
                      <button
                        key={m.id}
                        type="button"
                        data-ink-box
                        {...{ [NOTE_OPENER]: m.id }}
                        aria-label={t("reader.openNoteNamed", { title: m.title || t("note.untitled") })}
                        title={m.title || t("note.untitled")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenNote(m.noteId);
                        }}
                        className={cn(
                          "relative -my-1 mr-1 inline-flex size-6 items-center justify-center rounded-full align-middle hover:bg-accent",
                          focusRing,
                        )}
                        style={{ color: NOTE_INK_TEXT }}
                      >
                        <FileText className="size-3" />
                      </button>
                    ))}
                  {piece.showNumber && (otherVersionCounts.get(v.verse) ?? 0) > 0 && (
                    // Notes live on their home translation; this bridges versions
                    <sup
                      title={t("reader.otherVersions", { count: otherVersionCounts.get(v.verse) })}
                      className="mr-1 select-none align-super font-mono text-[0.55em] text-muted-foreground"
                    >
                      ⁘{otherVersionCounts.get(v.verse)}
                    </sup>
                  )}
                  {groupByAnnotation(v.verse, piece.words, annotationCoverage).map((seg, si) => {
                    const active = seg.annotation && seg.annotation.id === activeAnnotationId;
                    const wordSpans = seg.words.map(({ i, text, cut }) => {
                      const marked = hlCoverage.has(`${v.verse}:${i}`) || seg.annotation;
                      // Highlight + selection washes are painted by HighlightMarks
                      // (full line-height, behind the text), measured from this
                      // span's data-verse/word. A word cut by a line break renders
                      // as two spans, same index.
                      return (
                        <span
                          key={`${i}${cut ? "a" : ""}`}
                          data-verse={v.verse}
                          data-word={i}
                          className={marked || mobile ? "cursor-pointer" : undefined}
                        >
                          {text}
                          {cut ? "" : " "}
                        </span>
                      );
                    });
                    return seg.annotation ? (
                      <span
                        key={si}
                        data-annotation-anchor={seg.annotation.id}
                        data-spotlit={seg.annotation.id === selectedMarkId || undefined}
                        className={active ? "rounded-[3px] [box-decoration-break:clone]" : undefined}
                        style={active ? { backgroundColor: NOTE_INK_WASH } : undefined}
                      >
                        {wordSpans}
                      </span>
                    ) : (
                      <Fragment key={si}>{wordSpans}</Fragment>
                    );
                  })}
                  {lines?.map((a) =>
                    editingId === a.id ? (
                      <span key={a.id} className="my-1 block indent-0">
                        <AnnotationEditor
                          text={a.text}
                          onSave={(text) => {
                            onEditAnnotation(a.id, text);
                            setEditingId(null);
                          }}
                          onRemove={() => {
                            onRemoveAnnotation(a.id);
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </span>
                    ) : (
                      // A line under the verse: reserves its own space, so the
                      // handwriting never sits on the words (#63)
                      <button
                        key={a.id}
                        type="button"
                        data-ink-box
                        aria-label={t("reader.editAnnotation", { text: a.text })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(a.id);
                        }}
                        onPointerEnter={() => onFocusAnnotation(a.id)}
                        onPointerLeave={() => onFocusAnnotation(null)}
                        className={cn(
                          "my-1 block w-full rounded-sm border-l-2 py-0.5 pl-2 text-left indent-0 font-serif text-[0.8em] leading-snug italic hover:bg-accent/50",
                          focusRing,
                        )}
                        style={{
                          borderColor: NOTE_INK,
                          color: a.id === activeAnnotationId ? NOTE_INK_TEXT_ACTIVE : NOTE_INK_TEXT,
                        }}
                      >
                        {a.text}
                      </button>
                    ),
                  )}
                </span>
              );
            })}
          </p>
        </Fragment>
      ))}

      {/* Native-style selection handles: lollipops under the boundary words;
          drag stretches the span, the menu follows the end word */}
      {mobile &&
        handleRects &&
        menu?.kind === "selection" &&
        createPortal(
          <>
            {(["start", "end"] as const).map((which) => {
              const r = handleRects[which];
              return (
                <div
                  key={which}
                  {...{ [SELECTION_UI_ATTR]: "" }}
                  className="fixed z-50 -translate-x-1/2 touch-none"
                  style={{
                    left: which === "start" ? r.left : r.right,
                    top: r.bottom - 2,
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      dragHandle(which, e.clientX, e.clientY);
                  }}
                >
                  {/* Fat invisible hit area, small visible lollipop */}
                  <div className="flex h-9 w-9 items-start justify-center">
                    <div className="h-4 w-4 rounded-full border-2 border-primary bg-primary/30 shadow-sm" />
                  </div>
                </div>
              );
            })}
          </>,
          document.body,
        )}

      <ActionMenu
        // A fresh menu per view: focus lands on the new list
        key={menu?.kind === "attach" ? "attach" : "actions"}
        open={menu?.kind === "selection" || menu?.kind === "highlight" || menu?.kind === "attach"}
        onOpenChange={(open, keyboard) => !open && closeMenu(keyboard)}
        anchor={virtualAnchor}
        mobile={mobile}
        label={t(
          menu?.kind === "highlight"
            ? "menu.highlightLabel"
            : menu?.kind === "attach"
              ? "menu.noteLink"
              : "menu.selectionLabel",
        )}
      >
        {menu?.kind === "attach" &&
          allNotes.map((n) => (
            <ActionMenuItem key={n.id} onSelect={() => onAttachNote(n.id, menu.anchor)}>
              <span className="min-w-0 flex-1 truncate font-serif">{n.title || t("note.untitled")}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {n.anchors.length > 0 && formatReference(anchorReference(n.anchors[0]))}
                {n.anchors.length > 1 && ` +${n.anchors.length - 1}`}
              </span>
            </ActionMenuItem>
          ))}
        {menu?.kind === "selection" && (
          <>
            {/* Highlight = pick a colour; the account default is ringed */}
            <ActionMenuColors
              value={null}
              preferred={defaultColor}
              onPick={(color) => addHighlight(menu.anchor, color)}
            />
            <ActionMenuSeparator />
            <ActionMenuItem
              hint={t("menu.annotateHint")}
              onSelect={() => {
                setDraft("");
                const compose = { kind: "compose" as const, anchor: menu.anchor };
                nextMenu.current = compose;
                setMenu(compose);
              }}
            >
              {t("menu.annotate")}
            </ActionMenuItem>
            <ActionMenuItem hint={t("menu.createNoteHint")} onSelect={() => onAddNote(menu.anchor)}>
              {t("menu.createNote")}
            </ActionMenuItem>
            {allNotes.length > 0 && (
              <ActionMenuItem
                hint={t("menu.noteLinkHint")}
                onSelect={() => {
                  const attach = { kind: "attach" as const, anchor: menu.anchor };
                  nextMenu.current = attach;
                  setMenu(attach);
                }}
              >
                {t("menu.noteLink")}
              </ActionMenuItem>
            )}
            <ActionMenuSeparator />
            <ActionMenuItem hint={t("menu.copyHint")} onSelect={() => void copyAnchorText(menu.anchor)}>
              {t("menu.copy")}
            </ActionMenuItem>
          </>
        )}
        {menu?.kind === "highlight" && (
          <>
            <ActionMenuColors
              value={menu.highlight.color}
              preferred={defaultColor}
              onPick={(color) => {
                if (color !== menu.highlight.color) onRecolorHighlight(menu.highlight.id, color);
              }}
            />
            <ActionMenuSeparator />
            <ActionMenuItem hint={t("menu.createNoteHint")} onSelect={() => onAddNote(menu.highlight)}>
              {t("menu.addNote")}
            </ActionMenuItem>
            <ActionMenuItem hint={t("menu.copyHint")} onSelect={() => void copyAnchorText(menu.highlight)}>
              {t("menu.copy")}
            </ActionMenuItem>
            <ActionMenuSeparator />
            <ActionMenuItem destructive onSelect={() => onRemoveHighlight(menu.highlight.id)}>
              {t("menu.removeHighlight")}
            </ActionMenuItem>
          </>
        )}
      </ActionMenu>

      <AnchoredPanel
        open={menu?.kind === "compose"}
        onOpenChange={(open, keyboard) => !open && closeMenu(keyboard)}
        anchor={virtualAnchor}
        mobile={mobile}
        label={t("menu.annotationLabel")}
        initialFocus={draftRef}
      >
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveDraft(true);
          }}
          placeholder={t("menu.annotationPlaceholder")}
          aria-label={t("menu.annotationPlaceholder")}
          className={cn(
            "h-20 resize-none rounded border border-border bg-background p-2 font-serif text-base focus:border-primary/50 sm:text-sm",
            focusRing,
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{t("menu.saveHint")}</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={(e) => closeMenu(e.detail === 0)}
              className={cn("min-h-8 rounded px-2.5 text-sm hover:bg-accent", focusRing)}
            >
              {t("menu.cancel")}
            </button>
            <button
              type="button"
              onClick={(e) => saveDraft(e.detail === 0)}
              className={cn(
                "min-h-8 rounded bg-primary px-2.5 text-sm text-primary-foreground hover:opacity-90",
                focusRing,
              )}
            >
              {t("menu.save")}
            </button>
          </span>
        </div>
      </AnchoredPanel>
    </div>
  );
}
