import type { Anchor, Chapter, Highlight, HighlightColor } from "@biblestdy/shared";
import {
  buildAnchor,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  words,
  wordRangeInVerse,
} from "@biblestdy/shared";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authClient } from "~/lib/auth-client";
import { HIGHLIGHT_BG, HIGHLIGHT_SWATCH } from "./highlight-colors";

function isColor(value: unknown): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}

type Menu =
  | { kind: "add"; anchor: Anchor; x: number; y: number }
  | { kind: "remove"; id: string; x: number; y: number }
  | null;

function sectionsBefore(chapter: Chapter, verse: number): string[] {
  return (chapter.sections ?? []).filter((s) => s.beforeVerse === verse).map((s) => s.title);
}

function wordElFromNode(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>("[data-word]") ?? null;
}

/**
 * Renders chapter verses as per-word spans and turns a drag-selection into a
 * highlight anchor (verse-relative word indices via the shared Anchor module).
 * The action menu is a self-controlled toolbar portaled to <body> (so the
 * translateX pagination container can't capture position:fixed) and positioned
 * from the selected word element (range rects are unreliable in CSS columns).
 */
export function ChapterText({
  chapter,
  heading,
  highlights,
  onAdd,
  onRemove,
}: {
  chapter: Chapter;
  heading: string;
  highlights: Highlight[];
  onAdd: (anchor: Anchor, color: HighlightColor) => void;
  onRemove: (id: string) => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const { data: session } = authClient.useSession();
  const defaultColor: HighlightColor = isColor(session?.user.defaultHighlightColor)
    ? session.user.defaultHighlightColor
    : DEFAULT_HIGHLIGHT_COLOR;

  // Which highlight (if any) covers each (verse,word) — first match wins.
  const coverage = new Map<string, { id: string; color: HighlightColor }>();
  for (const v of chapter.verses) {
    const count = words(v.text).length;
    for (const h of highlights) {
      const range = wordRangeInVerse(h, v.verse, count);
      if (!range) continue;
      for (let w = range.start; w <= range.end; w++) {
        const key = `${v.verse}:${w}`;
        if (!coverage.has(key)) coverage.set(key, { id: h.id, color: h.color });
      }
    }
  }

  const chapterKey = `${chapter.translationId}/${chapter.book}.${chapter.chapter}`;
  useEffect(() => setMenu(null), [chapterKey]);

  // Dismiss on outside pointerdown, Escape, or scroll/resize (stale position).
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof PointerEvent) {
        const t = e.target as HTMLElement;
        if (t.closest("[data-selection-menu]")) return;
      }
      setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(null));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

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
    const r = endEl.getBoundingClientRect();
    setMenu({ kind: "add", anchor, x: r.left + r.width / 2, y: r.top });
  }

  function onWordClick(event: React.MouseEvent, hlId: string | undefined) {
    if (!hlId) return;
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind: "remove", id: hlId, x: r.left + r.width / 2, y: r.top });
  }

  function addHighlight(color: HighlightColor) {
    if (menu?.kind !== "add") return;
    onAdd(menu.anchor, color);
    // Last-used becomes the profile default (persists + syncs across devices)
    if (color !== defaultColor) void authClient.updateUser({ defaultHighlightColor: color });
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
            {tokens.map((word, i) => {
              const hit = coverage.get(`${v.verse}:${i}`);
              return (
                <span
                  key={i}
                  data-verse={v.verse}
                  data-word={i}
                  onClick={(e) => onWordClick(e, hit?.id)}
                  className={hit ? "cursor-pointer" : undefined}
                  style={hit ? { backgroundColor: HIGHLIGHT_BG[hit.color] } : undefined}
                >
                  {word}{" "}
                </span>
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
            <div className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-lg">
              {menu.kind === "add" ? (
                <>
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
                  <span className="mx-0.5 h-4 w-px bg-border" />
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
                </>
              ) : (
                <button
                  type="button"
                  className="rounded px-2.5 py-1 font-mono text-xs text-destructive hover:bg-accent"
                  onClick={() => {
                    onRemove(menu.id);
                    setMenu(null);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
