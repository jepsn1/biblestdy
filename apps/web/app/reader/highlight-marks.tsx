import type { Anchor, Highlight } from "@biblestdy/shared";
import { useState, type RefObject } from "react";
import { isShown, type HighlightFilter } from "~/lib/highlight-filter";
import { HIGHLIGHT_BG } from "./highlight-colors";
import { SPOT_FADE, touchesSpot, type SpotRange } from "./spotlight";
import { clampToColumn, lineRuns, type ColumnFlow, type Rect } from "./ink-geometry";
import { sameData, useMeasure } from "./use-measure";

/**
 * Marker layer. Highlights (and the live selection) are drawn as full
 * line-height rects measured from each anchor's word range and rendered
 * BEHIND the text, so: wrapped lines tile with no white gap, the wash bridges
 * spaces and verse numbers, and all glyphs (verse numbers included) stay in
 * front — like real marker under real print. Every line is its own 3px-radius
 * piece (the box-decoration-break: clone look), clamped to its text column.
 */

type MarkRect = { key: string; x: number; y: number; w: number; h: number; color: string; faint?: boolean; dim?: boolean };

/** A colour the key filters out: still there, see-through. */
const FAINT = 0.3;

/** One radius for every wash (#63). */
const RADIUS = 3;

export function HighlightMarks({
  highlights,
  selection,
  boxRef,
  flowRef,
  scopeRef,
  layoutKey,
  spot = null,
  shown = null,
}: {
  highlights: Highlight[];
  /** The selection being made — painted like a highlight, in --selection. */
  selection: Anchor | null;
  /** The content box: the layer's coordinate space (it renders inside it). */
  boxRef: RefObject<HTMLElement | null>;
  /** The (multi-)column text flow: washes clamp to its columns. */
  flowRef: RefObject<HTMLElement | null>;
  /** The chapter's own part of the flow, where its words are looked up — a
   * page can carry two chapters (verse numbers repeat). Default: the flow. */
  scopeRef?: RefObject<HTMLElement | null>;
  /** Anything that moves the words without resizing the boxes (stride,
   * column count, text size) — re-measure on change. */
  layoutKey: string;
  /** The spotlit reference (#210): its whole verses get the strong link
   * wash (not under a highlight: blue over gold turns muddy); highlights
   * inside stay at full strength, those outside fade — never hidden. */
  spot?: SpotRange | null;
  /** The colour key's filter (null = all): other colours paint faint. */
  shown?: HighlightFilter;
}) {
  const [rects, setRects] = useState<MarkRect[]>([]);

  useMeasure(
    () => [boxRef.current, flowRef.current],
    () => {
      const box = boxRef.current;
      const flowEl = flowRef.current;
      if (!box || !flowEl) return;
      // Page-independent (#ink slides): word rects relative to the flow
      // (its page-turn transform cancels out), placed at the flow's
      // untransformed spot in the box. The caller's layer carries the same
      // transform as the text, so every page's ink slides with its words.
      // Mobile sheet-scale (#13): rects are visual (scaled) px — divide out.
      const s = box.getBoundingClientRect().width / box.offsetWidth || 1;
      const flowRect = flowEl.getBoundingClientRect();
      const ox = flowEl.offsetLeft;
      const oy = flowEl.offsetTop;
      const style = getComputedStyle(flowEl);
      const count = Number(style.columnCount) || 1; // "auto" -> 1
      // Overflow columns (= later pages) keep the gap even at column-count 1
      const gap = parseFloat(style.columnGap) || 0;
      const flow: ColumnFlow = {
        x: ox,
        colWidth: (flowEl.clientWidth - gap * (count - 1)) / count,
        gap,
      };
      const out: MarkRect[] = [];
      const paint = (
        a: Anchor,
        key: string,
        color: string,
        { faint = false, dim = false, skip }: { faint?: boolean; dim?: boolean; skip?: (v: number, w: number) => boolean } = {},
      ) => {
        // Measure straight from the word spans — overlapping highlights all
        // render, independent of any per-word ownership. A skipped word
        // splits the run (its own wash shows there instead)
        const runs: Rect[][] = [[]];
        let lineH = 36;
        for (let v = a.startVerse; v <= a.endVerse; v++) {
          const els = (scopeRef?.current ?? flowEl).querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
          for (const el of els) {
            const w = Number(el.dataset.word);
            if (v === a.startVerse && w < a.startWord) continue;
            if (v === a.endVerse && w > a.endWord) continue;
            if (skip?.(v, w)) {
              if (runs.at(-1)!.length) runs.push([]);
              continue;
            }
            const vr = el.getBoundingClientRect();
            if (vr.width === 0) continue;
            lineH = parseFloat(getComputedStyle(el).lineHeight) || 36;
            runs.at(-1)!.push({
              left: (vr.left - flowRect.left) / s + ox,
              top: (vr.top - flowRect.top) / s + oy,
              right: (vr.right - flowRect.left) / s + ox,
              bottom: (vr.bottom - flowRect.top) / s + oy,
            });
          }
        }
        runs.flatMap((words) => lineRuns(words)).forEach((line, i) => {
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
            faint,
            dim,
          });
        });
      };
      // Wider washes paint first so a nested highlight's color reads on top
      const size = (a: Anchor) => (a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord);
      // Faint (filtered-out) ones first: a shown colour always reads on top
      const faint = (hl: Highlight) => !isShown(shown, hl.color);
      const sorted = [...highlights].sort((a, b) => Number(faint(b)) - Number(faint(a)) || size(b) - size(a));
      // The spotlit verses' wash, first (behind everything), skipping words
      // a highlight carries
      if (spot && spot.end >= spot.start) {
        const under = (v: number, w: number) =>
          sorted.some(
            (hl) =>
              (v > hl.startVerse || (v === hl.startVerse && w >= hl.startWord)) &&
              (v < hl.endVerse || (v === hl.endVerse && w <= hl.endWord)),
          );
        paint(
          { translationId: "", book: "", chapter: 0, startVerse: spot.start, startWord: 0, endVerse: spot.end, endWord: Number.MAX_SAFE_INTEGER },
          "spot",
          "var(--link-wash-strong)",
          { skip: under },
        );
      }
      for (const hl of sorted)
        paint(hl, hl.id, HIGHLIGHT_BG[hl.color], { faint: faint(hl), dim: !!spot && !touchesSpot(spot, hl) });
      if (selection) paint(selection, "selection", "var(--selection)");
      setRects((prev) => (sameData(prev, out) ? prev : out));
    },
    [highlights, selection, layoutKey, boxRef, flowRef, scopeRef, shown, spot?.start, spot?.end],
  );

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible"
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
          fillOpacity={(r.faint ? FAINT : 1) * (r.dim ? SPOT_FADE : 1)}
          data-spot-dim={r.dim || undefined}
          className="transition-[fill-opacity] duration-200 motion-reduce:transition-none"
        />
      ))}
    </svg>
  );
}
