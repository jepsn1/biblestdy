import type { Highlight } from "@biblestdy/shared";
import { useLayoutEffect, useState, type RefObject } from "react";
import { HIGHLIGHT_BG } from "./highlight-colors";
import { markerPath } from "./scribble";

/**
 * Marker layer. Highlights are drawn as full line-height rects measured from
 * the highlighted word spans ([data-hl]) and rendered BEHIND the text, so:
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
}: {
  highlights: Highlight[];
  regionRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  page: number;
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
      for (const hl of highlights) {
        const els = region.querySelectorAll<HTMLElement>(`[data-hl="${hl.id}"]`);
        if (els.length === 0) continue;
        const lineH = parseFloat(getComputedStyle(els[0]).lineHeight) || 36;
        // Merge word fragments into one run per line (same top, same column —
        // a large horizontal gap means the other column of the spread)
        type Run = { top: number; bottom: number; left: number; right: number };
        const runs: Run[] = [];
        for (const el of els) {
          for (const r of el.getClientRects()) {
            if (r.width === 0) continue;
            if (r.right < contentRect.left + 1 || r.left > contentRect.right - 1) continue;
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
    <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
      {rects.map((r) => (
        <path key={r.key} d={markerPath(r.x, r.y, r.w, r.h, r.key)} fill={r.color} />
      ))}
    </svg>
  );
}
