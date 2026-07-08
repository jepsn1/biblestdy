import type { Anchor, Chapter, Highlight } from "@biblestdy/shared";
import { buildAnchor, words, wordRangeInVerse } from "@biblestdy/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Toolbar =
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
 * Clicking an existing highlight offers removal.
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
  onAdd: (anchor: Anchor) => void;
  onRemove: (id: string) => void;
}) {
  const [toolbar, setToolbar] = useState<Toolbar>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Which highlight (if any) covers each (verse,word) — first match wins.
  const coverage = new Map<string, string>();
  for (const v of chapter.verses) {
    const count = words(v.text).length;
    for (const h of highlights) {
      const range = wordRangeInVerse(h, v.verse, count);
      if (!range) continue;
      for (let w = range.start; w <= range.end; w++) {
        const key = `${v.verse}:${w}`;
        if (!coverage.has(key)) coverage.set(key, h.id);
      }
    }
  }

  useEffect(() => setToolbar(null), [chapter]);

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
    // Anchor the toolbar to the end word ELEMENT — range.getBoundingClientRect()
    // is unreliable inside the CSS-columns + translateX pagination layout.
    const rect = endEl.getBoundingClientRect();
    setToolbar({ kind: "add", anchor, x: rect.left + rect.width / 2, y: rect.top });
  }

  function onWordClick(event: React.MouseEvent, hlId: string | undefined) {
    if (!hlId) return;
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setToolbar({ kind: "remove", id: hlId, x: rect.left + rect.width / 2, y: rect.top });
  }

  return (
    <div ref={rootRef} onMouseUp={onMouseUp}>
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
              const hlId = coverage.get(`${v.verse}:${i}`);
              return (
                <span
                  key={i}
                  data-verse={v.verse}
                  data-word={i}
                  onClick={(e) => onWordClick(e, hlId)}
                  className={hlId ? "cursor-pointer bg-primary/25" : undefined}
                >
                  {word}{" "}
                </span>
              );
            })}
          </span>
        );
      })}

      {/* Portal to body: a transform ancestor (the translateX pagination
          container) would otherwise capture position:fixed. */}
      {toolbar &&
        createPortal(
        <div
          className="fixed z-20 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: toolbar.x, top: toolbar.y }}
        >
          <div className="flex overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {toolbar.kind === "add" ? (
              <button
                type="button"
                className="px-3 py-1.5 font-mono text-xs text-foreground hover:bg-accent"
                onClick={() => {
                  onAdd(toolbar.anchor);
                  window.getSelection()?.removeAllRanges();
                  setToolbar(null);
                }}
              >
                Highlight
              </button>
            ) : (
              <button
                type="button"
                className="px-3 py-1.5 font-mono text-xs text-destructive hover:bg-accent"
                onClick={() => {
                  onRemove(toolbar.id);
                  setToolbar(null);
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
