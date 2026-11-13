import type { Anchor, Highlight } from "@biblestdy/shared";
import { useLayoutEffect, useState, type RefObject } from "react";
import { HIGHLIGHT_BG } from "./highlight-colors";
import { clampToColumn, lineRuns, type ColumnFlow, type Rect } from "./ink-geometry";

/**
 * Marker layer. Highlights (and the live selection) are drawn as full
 * line-height rects measured from each anchor's word range and rendered
 * BEHIND the text, so: wrapped lines tile with no white gap, the wash bridges
 * spaces and verse numbers, and all glyphs (verse numbers included) stay in
 * front — like real marker under real print. Every line is its own 3px-radius
 * piece (the box-decoration-break: clone look), clamped to its text column.
 */

type MarkRect = { key: string; x: number; y: number; w: number; h: number; color: string };

/** One radius for every wash (#63). */
const RADIUS = 3;

export function HighlightMarks({
  highlights,
  selection,
  regionRef,
  contentRef,
  flowRef,
  layoutKey,
  hidden = false,
}: {
  highlights: Highlight[];
  /** The selection being made — painted like a highlight, in --selection. */
  selection: Anchor | null;
  regionRef: RefObject<HTMLDivElement | null>;
  /** The content box: words outside it are on another page. */
  contentRef: RefObject<HTMLElement | null>;
  /** The (multi-)column text flow: washes clamp to its columns. */
  flowRef: RefObject<HTMLElement | null>;
  /** Anything that moves the words without resizing the boxes (page,
   * stride, column count, text size) — re-measure on change. */
  layoutKey: string;
  /** Spotlight active — the marker layer disappears with the other ink. */
  hidden?: boolean;
}) {
  const [rects, setRects] = useState<MarkRect[]>([]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    const content = contentRef.current;
    const flowEl = flowRef.current;
    if (!region || !content || !flowEl) return;

    const measure = () => {
      const regionRect = region.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      // Mobile sheet-scale (#13): rects come back in visual (scaled) px, the
      // overlay paints in the region's local space — divide the scale out.
      const s = regionRect.width / region.offsetWidth || 1;
      const contentLeft = (contentRect.left - regionRect.left) / s;
      const contentRight = (contentRect.right - regionRect.left) / s;
      const style = getComputedStyle(flowEl);
      const count = Number(style.columnCount) || 1; // "auto" -> 1
      // Overflow columns (= later pages) keep the gap even at column-count 1
      const gap = parseFloat(style.columnGap) || 0;
      const flow: ColumnFlow = {
        x: (flowEl.getBoundingClientRect().left - regionRect.left) / s,
        colWidth: (flowEl.clientWidth - gap * (count - 1)) / count,
        gap,
      };
      const out: MarkRect[] = [];
      const paint = (a: Anchor, key: string, color: string) => {
        // Measure straight from the word spans — overlapping highlights all
        // render, independent of any per-word ownership
        const words: Rect[] = [];
        let lineH = 36;
        for (let v = a.startVerse; v <= a.endVerse; v++) {
          const els = region.querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
          for (const el of els) {
            const w = Number(el.dataset.word);
            if (v === a.startVerse && w < a.startWord) continue;
            if (v === a.endVerse && w > a.endWord) continue;
            const vr = el.getBoundingClientRect();
            if (vr.width === 0) continue;
            const r = {
              left: (vr.left - regionRect.left) / s,
              top: (vr.top - regionRect.top) / s,
              right: (vr.right - regionRect.left) / s,
              bottom: (vr.bottom - regionRect.top) / s,
            };
            if (r.right < contentLeft + 1 || r.left > contentRight - 1) continue;
            lineH = parseFloat(getComputedStyle(el).lineHeight) || 36;
            words.push(r);
          }
        }
        lineRuns(words).forEach((line, i) => {
          const run = clampToColumn(line, flow);
          // Expand the glyph box to the full line box, plus a little extra so
          // adjacent lines OVERLAP slightly — the faint darker band at the
          // join is how stacked marker passes look on paper
          const pad = Math.max(0, (lineH - (run.bottom - run.top)) / 2) + 1.5;
          out.push({
            key: `${key}:${i}`,
            x: run.left,
            y: run.top - pad,
            w: run.right - run.left,
            h: run.bottom - run.top + pad * 2,
            color,
          });
        });
      };
      // Wider washes paint first so a nested highlight's color reads on top
      const size = (a: Anchor) => (a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord);
      for (const hl of [...highlights].sort((a, b) => size(b) - size(a)))
        paint(hl, hl.id, HIGHLIGHT_BG[hl.color]);
      if (selection) paint(selection, "selection", "var(--selection)");
      setRects(out);
    };

    measure();
    // Re-measure after the page-flip transform settles, and once webfonts
    // land (Literata swaps in -> lines rewrap under fixed-size boxes).
    const t = setTimeout(measure, 340);
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    const ro = new ResizeObserver(measure);
    ro.observe(region);
    ro.observe(content);
    ro.observe(flowEl);
    return () => {
      alive = false;
      clearTimeout(t);
      ro.disconnect();
    };
  }, [highlights, selection, layoutKey, regionRef, contentRef, flowRef]);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible transition-opacity duration-200"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      {rects.map((r) => (
        <rect
          key={r.key}
          data-wash={r.key}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={RADIUS}
          fill={r.color}
        />
      ))}
    </svg>
  );
}
