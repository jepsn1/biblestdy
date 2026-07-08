import type { Anchor, Chapter, Highlight, HighlightColor, Note } from "@biblestdy/shared";
import {
  buildAnchor,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  words,
  wordRangeInVerse,
} from "@biblestdy/shared";
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authClient } from "~/lib/auth-client";
import { HIGHLIGHT_BG, HIGHLIGHT_SWATCH, NOTE_INK } from "./highlight-colors";

function isColor(value: unknown): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}

type Pos = { x: number; y: number };
type Menu =
  | ({ kind: "add"; anchor: Anchor } & Pos)
  | ({ kind: "compose"; anchor: Anchor } & Pos)
  | ({ kind: "remove-hl"; id: string } & Pos)
  | null;

function sectionsBefore(chapter: Chapter, verse: number): string[] {
  return (chapter.sections ?? []).filter((s) => s.beforeVerse === verse).map((s) => s.title);
}

/**
 * Faked dotted underline: a repeating dot background at the bottom of the run
 * wrapper. Native text-decoration can't render a clean continuous dotted line
 * across per-word spans (spaces go solid / dots misalign), so we paint it.
 */
const NOTE_UNDERLINE: React.CSSProperties = {
  backgroundImage: `radial-gradient(${NOTE_INK} 45%, transparent 47%)`,
  backgroundSize: "0.28em 2px",
  backgroundRepeat: "repeat-x",
  backgroundPosition: "0 100%",
  paddingBottom: "2px",
};

type WordSeg = { note: Note | null; words: { word: string; i: number }[] };

/** Split a verse's words into runs of the same note (null = un-noted). */
function groupByNote(verse: number, tokens: string[], noteCoverage: Map<string, Note>): WordSeg[] {
  const segs: WordSeg[] = [];
  tokens.forEach((word, i) => {
    const note = noteCoverage.get(`${verse}:${i}`) ?? null;
    const last = segs[segs.length - 1];
    if (last && (last.note?.id ?? null) === (note?.id ?? null)) last.words.push({ word, i });
    else segs.push({ note, words: [{ word, i }] });
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
  notes,
  activeNoteId,
  onAddHighlight,
  onRemoveHighlight,
  onAddNote,
  onFocusNote,
}: {
  chapter: Chapter;
  heading: string;
  highlights: Highlight[];
  notes: Note[];
  activeNoteId: string | null;
  onAddHighlight: (anchor: Anchor, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddNote: (anchor: Anchor, text: string) => void;
  onFocusNote: (id: string | null) => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [draft, setDraft] = useState("");
  const { data: session } = authClient.useSession();
  const defaultColor: HighlightColor = isColor(session?.user.defaultHighlightColor)
    ? session.user.defaultHighlightColor
    : DEFAULT_HIGHLIGHT_COLOR;

  const hlCoverage = new Map<string, { id: string; color: HighlightColor }>();
  coverInto(hlCoverage, chapter.verses, highlights.map((h) => ({ ...h, value: { id: h.id, color: h.color } })));
  const noteCoverage = new Map<string, Note>();
  coverInto(noteCoverage, chapter.verses, notes.map((n) => ({ ...n, value: n })));

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

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl = wordElFromNode(range.startContainer);
    const endEl = wordElFromNode(range.endContainer);
    if (!startEl || !endEl) return;
    const anchor = buildAnchor(
      { translationId: chapter.translationId, book: chapter.book, chapter: chapter.chapter },
      { verse: Number(startEl.dataset.verse), word: Number(startEl.dataset.word) },
      { verse: Number(endEl.dataset.verse), word: Number(endEl.dataset.word) },
    );
    setMenu({ kind: "add", anchor, ...posOf(endEl) });
  }

  function onWordClick(event: React.MouseEvent, hlId: string | undefined, noteId: string | undefined) {
    if (noteId) {
      event.stopPropagation();
      onFocusNote(noteId); // highlight the matching margin note
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
    if (text && menu?.kind === "compose") onAddNote(menu.anchor, text);
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  return (
    <div onMouseUp={onMouseUp}>
      <h1 className="mb-8 font-serif text-3xl font-medium tracking-tight">{heading}</h1>
      {chapter.verses.map((v) => {
        const tokens = words(v.text);
        return (
          <span key={v.verse} data-verse={v.verse}>
            {sectionsBefore(chapter, v.verse).map((title) => (
              <span
                key={title}
                className="mt-6 mb-2 block font-sans text-[0.7rem] font-semibold tracking-widest text-primary/80 uppercase first:mt-0"
              >
                {title}
              </span>
            ))}
            <sup className="mr-1.5 select-none align-super font-sans text-[0.65rem] font-medium text-primary/70">
              {v.verse}
            </sup>
            {groupByNote(v.verse, tokens, noteCoverage).map((seg, si) => {
              const active = seg.note && seg.note.id === activeNoteId;
              const wordSpans = seg.words.map(({ word, i }) => {
                const hit = hlCoverage.get(`${v.verse}:${i}`);
                return (
                  <span
                    key={i}
                    data-verse={v.verse}
                    data-word={i}
                    onClick={(e) => onWordClick(e, hit?.id, seg.note?.id)}
                    className={hit || seg.note ? "cursor-pointer" : undefined}
                    style={hit ? { backgroundColor: HIGHLIGHT_BG[hit.color] } : undefined}
                  >
                    {word}{" "}
                  </span>
                );
              });
              return seg.note ? (
                <span
                  key={si}
                  data-note-anchor={seg.note.id}
                  style={active ? { ...NOTE_UNDERLINE, backgroundColor: "oklch(0.83 0.1 85 / 0.12)" } : NOTE_UNDERLINE}
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
            <div className="rounded-md border border-border bg-popover shadow-lg">
              {menu.kind === "add" && (
                <div className="flex items-center gap-1 p-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs text-foreground hover:bg-accent"
                    onClick={() => addHighlight(defaultColor)}
                    title={`Highlight (${defaultColor})`}
                  >
                    Highlight
                    <span
                      className="size-2 rounded-full ring-1 ring-foreground/15"
                      style={{ backgroundColor: HIGHLIGHT_SWATCH[defaultColor] }}
                    />
                  </button>
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      title={color}
                      onClick={() => addHighlight(color)}
                      className="size-4 rounded-full ring-1 ring-foreground/15 transition-transform hover:scale-115"
                      style={{ backgroundColor: HIGHLIGHT_SWATCH[color] }}
                    />
                  ))}
                  <span className="mx-0.5 h-4 w-px bg-border" />
                  <button
                    type="button"
                    className="rounded px-2.5 py-1 font-mono text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      setDraft("");
                      setMenu({ ...menu, kind: "compose" });
                    }}
                  >
                    Note
                  </button>
                </div>
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
                    placeholder="Your note…"
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
