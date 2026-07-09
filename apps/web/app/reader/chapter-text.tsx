import type { Anchor, Chapter, Note, Highlight, HighlightColor, Annotation } from "@biblestdy/shared";
import {
  anchorReference,
  buildAnchor,
  DEFAULT_HIGHLIGHT_COLOR,
  formatReference,
  HIGHLIGHT_COLORS,
  words,
  wordRangeInVerse,
} from "@biblestdy/shared";
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authClient } from "~/lib/auth-client";
import { ScrollArea } from "~/components/ui/scroll-area";
import { HIGHLIGHT_SWATCH, NOTE_INK_WASH } from "./highlight-colors";
import type { NoteMark } from "./use-notes";

function isColor(value: unknown): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}

type Pos = { x: number; y: number };
type Menu =
  | ({ kind: "add"; anchor: Anchor } & Pos)
  | ({ kind: "compose"; anchor: Anchor } & Pos)
  | ({ kind: "attach"; anchor: Anchor } & Pos)
  | ({ kind: "remove-hl"; id: string } & Pos)
  | null;

function sectionsBefore(chapter: Chapter, verse: number): string[] {
  return (chapter.sections ?? []).filter((s) => s.beforeVerse === verse).map((s) => s.title);
}

// Marked spans carry no inline decoration — AnnotationMarks draws a hand-drawn
// ink loop around [data-annotation-anchor] spans plus the placed box + arrow.

/** Annotations and notes (markdown docs) share the anchor pipeline; note ids
 * are namespaced "note:<id>" so clicks/marks can tell them apart. */
type AnchorRef = { id: string };
type WordSeg = { annotation: AnchorRef | null; words: { word: string; i: number }[] };

/** Split a verse's words into runs of the same anchored mark (null = unmarked). */
function groupByAnnotation(
  verse: number,
  tokens: string[],
  annotationCoverage: Map<string, AnchorRef>,
): WordSeg[] {
  const segs: WordSeg[] = [];
  tokens.forEach((word, i) => {
    const annotation = annotationCoverage.get(`${verse}:${i}`) ?? null;
    const last = segs[segs.length - 1];
    if (last && (last.annotation?.id ?? null) === (annotation?.id ?? null)) last.words.push({ word, i });
    else segs.push({ annotation, words: [{ word, i }] });
  });
  return segs;
}

function wordElFromNode(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>("[data-word]") ?? null;
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

export function ChapterText({
  chapter,
  heading,
  highlights,
  annotations,
  noteMarks,
  allNotes,
  activeAnnotationId,
  selectedMarkId,
  onAddHighlight,
  onRemoveHighlight,
  onAddAnnotation,
  onAddNote,
  onAttachNote,
  onOpenNote,
  onFocusAnnotation,
}: {
  chapter: Chapter;
  heading: string;
  highlights: Highlight[];
  annotations: Annotation[];
  noteMarks: NoteMark[];
  /** Every note of the user — the attach-an-existing-note picker. */
  allNotes: Note[];
  activeAnnotationId: string | null;
  /** Mark of the reference selected in the note panel — the rest of the page
   * dims slightly so the spotlight state is legible. */
  selectedMarkId: string | null;
  onAddHighlight: (anchor: Anchor, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddAnnotation: (anchor: Anchor, text: string) => void;
  onAddNote: (anchor: Anchor) => void;
  onAttachNote: (noteId: string, anchor: Anchor) => void;
  onOpenNote: (id: string) => void;
  onFocusAnnotation: (id: string | null) => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [draft, setDraft] = useState("");
  const { data: session } = authClient.useSession();
  const defaultColor: HighlightColor = isColor(session?.user.defaultHighlightColor)
    ? session.user.defaultHighlightColor
    : DEFAULT_HIGHLIGHT_COLOR;

  // Marks and highlights may overlap/nest (a circled or re-marked word inside
  // a larger span) — cover smallest span first so the most specific one wins
  // clicks + wash. Rendering measures each mark's own word range regardless.
  const spanSize = (a: Anchor) => (a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord);
  const hlCoverage = new Map<string, { id: string; color: HighlightColor }>();
  coverInto(
    hlCoverage,
    chapter.verses,
    [...highlights]
      .sort((a, b) => spanSize(a) - spanSize(b))
      .map((h) => ({ ...h, value: { id: h.id, color: h.color } })),
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

  const spotlight =
    selectedMarkId != null &&
    noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId);

  const chapterKey = `${chapter.translationId}/${chapter.book}.${chapter.chapter}`;
  useEffect(() => setMenu(null), [chapterKey]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest("[data-selection-menu]")) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  function posOf(el: HTMLElement): Pos {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }

  function onMouseUp(event: React.MouseEvent) {
    // The menu is portaled to <body> but React bubbles its events through this
    // tree — a mouseup on a menu button must not rebuild the menu from the
    // still-active text selection (it would remount the menu mid-click and
    // swallow the button's click).
    if ((event.target as HTMLElement).closest("[data-selection-menu]")) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let startEl = wordElFromNode(range.startContainer);
    let endEl = wordElFromNode(range.endContainer);
    if (!startEl || !endEl) return;
    // Word spans render as "word␣" — a drag starting in the gap before a word
    // anchors the range in the PREVIOUS span's trailing space (and a drag
    // ending right before a word touches its span at offset 0). Nudge
    // boundaries that cover no visible characters of their word.
    const spans = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-verse][data-word]"),
    );
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent ?? "";
      if (range.startOffset >= text.trimEnd().length) {
        startEl = spans[spans.indexOf(startEl) + 1] ?? null;
      }
    }
    if (range.endContainer.nodeType === Node.TEXT_NODE) {
      const text = range.endContainer.textContent ?? "";
      if (range.endOffset === 0 && text.trim() !== "") {
        endEl = spans[spans.indexOf(endEl) - 1] ?? null;
      }
    }
    if (!startEl || !endEl || spans.indexOf(startEl) > spans.indexOf(endEl)) return;
    const anchor = buildAnchor(
      { translationId: chapter.translationId, book: chapter.book, chapter: chapter.chapter },
      { verse: Number(startEl.dataset.verse), word: Number(startEl.dataset.word) },
      { verse: Number(endEl.dataset.verse), word: Number(endEl.dataset.word) },
    );
    setMenu({ kind: "add", anchor, ...posOf(endEl) });
  }

  function onWordClick(event: React.MouseEvent, hlId: string | undefined, noteId: string | undefined) {
    // A drag that ends on a marked word also fires a click — that's the
    // selection menu's turn, not remove/open.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (noteId?.startsWith("note:")) {
      event.stopPropagation();
      onOpenNote(noteId.split(":")[1]); // "note:<noteId>:<anchorId>" — open the note panel
      return;
    }
    if (noteId) {
      event.stopPropagation();
      onFocusAnnotation(noteId); // highlight the matching placed annotation
      return;
    }
    if (!hlId) return;
    event.stopPropagation();
    setMenu({ kind: "remove-hl", id: hlId, ...posOf(event.currentTarget as HTMLElement) });
  }

  function addHighlight(color: HighlightColor) {
    if (menu?.kind !== "add") return;
    onAddHighlight(menu.anchor, color);
    if (color !== defaultColor) void authClient.updateUser({ defaultHighlightColor: color });
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  function saveDraft() {
    const text = draft.trim();
    if (text && menu?.kind === "compose") onAddAnnotation(menu.anchor, text);
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  return (
    <div onMouseUp={onMouseUp} data-spotlight={spotlight || undefined}>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{heading}</h1>
      {chapter.verses.map((v) => {
        const tokens = words(v.text);
        return (
          <span key={v.verse} data-verse={v.verse}>
            {sectionsBefore(chapter, v.verse).map((title) => (
              <span
                key={title}
                data-section
                className="mt-6 mb-2 block font-sans text-[0.7rem] font-semibold tracking-widest text-primary/80 uppercase first:mt-0"
              >
                {title}
              </span>
            ))}
            <sup className="mr-1.5 select-none align-super font-sans text-[0.65rem] font-medium text-primary/70">
              {v.verse}
            </sup>
            {groupByAnnotation(v.verse, tokens, annotationCoverage).map((seg, si) => {
              const active = seg.annotation && seg.annotation.id === activeAnnotationId;
              const wordSpans = seg.words.map(({ word, i }) => {
                const hit = hlCoverage.get(`${v.verse}:${i}`);
                // Highlight wash is painted by HighlightMarks (full line-height,
                // behind the text), measured from this span's data-verse/word.
                return (
                  <span
                    key={i}
                    data-verse={v.verse}
                    data-word={i}
                    onClick={(e) => onWordClick(e, hit?.id, seg.annotation?.id)}
                    className={hit || seg.annotation ? "cursor-pointer" : undefined}
                  >
                    {word}{" "}
                  </span>
                );
              });
              return seg.annotation ? (
                <span
                  key={si}
                  data-annotation-anchor={seg.annotation.id}
                  data-spotlit={seg.annotation.id === selectedMarkId || undefined}
                  style={
                    active
                      ? { backgroundColor: NOTE_INK_WASH, borderRadius: "3px" }
                      : undefined
                  }
                >
                  {wordSpans}
                </span>
              ) : (
                <Fragment key={si}>{wordSpans}</Fragment>
              );
            })}
          </span>
        );
      })}

      {menu &&
        createPortal(
          <div
            data-selection-menu
            className="fixed z-50 -translate-x-1/2 -translate-y-full pb-2"
            style={{ left: menu.x, top: menu.y }}
          >
            <div
              key={menu.kind}
              className="animate-in fade-in zoom-in-95 slide-in-from-bottom-1 origin-bottom rounded-md border border-border bg-popover shadow-lg duration-150"
            >
              {menu.kind === "add" && (
                <div className="flex w-44 flex-col p-1">
                  {/* Highlight = pick a color; the default is ringed */}
                  <div className="flex items-center justify-between gap-1 px-2.5 py-1.5">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Highlight (${color})`}
                        title={`Highlight (${color})`}
                        onClick={() => addHighlight(color)}
                        className={`size-4 rounded-full transition-transform hover:scale-115 ${
                          color === defaultColor
                            ? "ring-2 ring-foreground/40"
                            : "ring-1 ring-foreground/15"
                        }`}
                        style={{ backgroundColor: HIGHLIGHT_SWATCH[color] }}
                      />
                    ))}
                  </div>
                  <div className="mx-1 my-0.5 h-px bg-border" />
                  <button
                    type="button"
                    title="A short handwritten scribble next to the text"
                    className="rounded px-2.5 py-1.5 text-left font-mono text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      setDraft("");
                      setMenu({ ...menu, kind: "compose" });
                    }}
                  >
                    Annotate
                  </button>
                  <button
                    type="button"
                    title="A markdown document, opens the side-by-side editor"
                    className="rounded px-2.5 py-1.5 text-left font-mono text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      onAddNote(menu.anchor);
                      window.getSelection()?.removeAllRanges();
                      setMenu(null);
                    }}
                  >
                    Create new note
                  </button>
                  {allNotes.length > 0 && (
                    <button
                      type="button"
                      title="Anchor an existing note to this span too"
                      className="rounded px-2.5 py-1.5 text-left font-mono text-xs text-foreground hover:bg-accent"
                      onClick={() => setMenu({ ...menu, kind: "attach" })}
                    >
                      Create note link…
                    </button>
                  )}
                </div>
              )}

              {menu.kind === "attach" && (
                <ScrollArea className="max-h-56 w-64" viewportClassName="max-h-56">
                  <div className="flex flex-col p-1">
                  {allNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="flex items-baseline justify-between gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                      onClick={() => {
                        onAttachNote(n.id, menu.anchor);
                        window.getSelection()?.removeAllRanges();
                        setMenu(null);
                      }}
                    >
                      <span className="truncate font-serif text-sm">
                        {n.title || "Untitled note"}
                      </span>
                      <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                        {n.anchors.length > 0 && formatReference(anchorReference(n.anchors[0]))}
                        {n.anchors.length > 1 && ` +${n.anchors.length - 1}`}
                      </span>
                    </button>
                  ))}
                  </div>
                </ScrollArea>
              )}

              {menu.kind === "compose" && (
                <div className="flex w-64 flex-col gap-2 p-2">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveDraft();
                    }}
                    placeholder="Your annotation…"
                    className="h-20 resize-none rounded border border-border bg-background p-2 font-serif text-sm outline-none focus:border-primary/50"
                  />
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.6rem] text-muted-foreground">⌘↵ to save</span>
                    <button
                      type="button"
                      onClick={saveDraft}
                      className="rounded bg-primary px-2.5 py-1 font-mono text-xs text-primary-foreground hover:opacity-90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {menu.kind === "remove-hl" && (
                <div className="p-1">
                  <button
                    type="button"
                    className="rounded px-2.5 py-1 font-mono text-xs text-destructive hover:bg-accent"
                    onClick={() => {
                      onRemoveHighlight(menu.id);
                      setMenu(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
