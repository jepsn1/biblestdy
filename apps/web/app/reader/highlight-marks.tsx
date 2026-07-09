import type { Highlight } from "@biblestdy/shared";
import { useLayoutEffect, useState, type RefObject } from "react";
import { HIGHLIGHT_BG } from "./highlight-colors";
import { markerPath } from "./scribble";

/**
 * Marker layer. Highlights are drawn as full line-height rects measured from
 * each highlight's word range and rendered BEHIND the text, so:
 * wrapped lines tile with no white gap, the wash bridges spaces and verse
 * numbers, and all glyphs (verse numbers included) stay in front — like real
 * marker under real print.
 */

type MarkRect = { key: string; x: number; y: number; w: number; h: number; color: string };

export function HighlightMarks({
  highlights,
  regionRef,
  contentRef,
  page,
  dimmed = false,
}: {
  highlights: Highlight[];
  regionRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  page: number;
  /** Spotlight active elsewhere — the marker layer recedes with the page. */
  dimmed?: boolean;
}) {
  const [rects, setRects] = useState<MarkRect[]>([]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    const content = contentRef.current;
    if (!region || !content) return;

    const measure = () => {
      const regionRect = region.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const out: MarkRect[] = [];
      // Wider washes paint first so a nested highlight's color reads on top
      const bySize = [...highlights].sort(
        (a, b) =>
          (b.endVerse - b.startVerse) * 1000 +
          (b.endWord - b.startWord) -
          ((a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord)),
      );
      for (const hl of bySize) {
        // Measure straight from the word spans — overlapping highlights all
        // render, independent of any per-word ownership
        const rects: DOMRect[] = [];
        let lineH = 36;
        for (let v = hl.startVerse; v <= hl.endVerse; v++) {
          const els = region.querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
          for (const el of els) {
            const w = Number(el.dataset.word);
            if (v === hl.startVerse && w < hl.startWord) continue;
            if (v === hl.endVerse && w > hl.endWord) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.right < contentRect.left + 1 || r.left > contentRect.right - 1) continue;
            lineH = parseFloat(getComputedStyle(el).lineHeight) || 36;
            rects.push(r);
          }
        }
        if (rects.length === 0) continue;
        // Merge word rects into one run per line (same top, same column —
        // a large horizontal gap means the other column of the spread)
        type Run = { top: number; bottom: number; left: number; right: number };
        const runs: Run[] = [];
        for (const r of rects) {
          const run = runs.find(
            (q) => Math.abs(q.top - r.top) < 3 && r.left - q.right < 60 && q.left - r.right < 60,
          );
          if (run) {
            run.left = Math.min(run.left, r.left);
            run.right = Math.max(run.right, r.right);
            run.bottom = Math.max(run.bottom, r.bottom);
          } else {
            runs.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
          }
        }
        runs.forEach((run, i) => {
          // Expand the glyph box to the full line box, plus a little extra so
          // wobbled strokes of adjacent lines OVERLAP slightly — the faint
          // darker band at the join is how stacked marker passes look on paper
          const pad = Math.max(0, (lineH - (run.bottom - run.top)) / 2) + 1.5;
          out.push({
            key: `${hl.id}:${i}`,
            x: run.left - regionRect.left - 1,
            y: run.top - regionRect.top - pad,
            w: run.right - run.left + 2,
            h: run.bottom - run.top + pad * 2,
            color: HIGHLIGHT_BG[hl.color],
          });
        });
      }
      setRects(out);
    };

    measure();
    // Re-measure after the page-flip transform settles.
    const t = setTimeout(measure, 340);
    const ro = new ResizeObserver(measure);
    ro.observe(region);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [highlights, page, regionRef, contentRef]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible transition-opacity duration-250"
      style={{ opacity: dimmed ? 0.25 : 1 }}
    >
      {rects.map((r) => (
        <path key={r.key} d={markerPath(r.x, r.y, r.w, r.h, r.key)} fill={r.color} />
      ))}
    </svg>
  );
}
