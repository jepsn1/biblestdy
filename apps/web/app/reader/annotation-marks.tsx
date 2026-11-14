import { useTranslation } from "react-i18next";
import type { Annotation } from "@biblestdy/shared";
import { FileText } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn, focusRing } from "~/lib/utils";
import { AnnotationEditor } from "./annotation-editor";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE } from "./highlight-colors";
import { lineRuns, placeRailChips, type Rect } from "./ink-geometry";
import type { NoteMark } from "./use-notes";
import { NOTE_OPENER } from "./note-panel";
import {
  bracketPath,
  leaderPath,
  SCRIBBLE_PAD_X,
  SCRIBBLE_PAD_Y,
  scribblePath,
} from "./scribble";

/**
 * Pen annotations: every annotation is a circled span plus a draggable, resizable
 * handwriting box (Excalidraw-style) connected by a hand-drawn arrow that
 * re-binds live. Never-dragged annotations start in the outer margin lane.
 * Placement/width persist as an offset from the anchored words' center, so a
 * annotation travels with its verse across reflow/pagination. Park the box right
 * next to its circle and the arrow disappears — the interlinear-gloss look,
 * placed by hand.
 */

const LANE = 190; // default box width, and the margin lane it starts in
const GAP = 20; // px between content box and the default lane
const MIN_W = 90;
const MAX_W = 600;
const EDGE = 36; // px kept clear at the pane edges (sheet-layout FLIP_STRIP gutter)
const ARROW_MIN_DIST = 40; // box closer than this to the circle: no arrow

const BRACKET_GAP = 10; // bracket spine sits this far left of the span's lines

/** Note chips (#63): the margin rail sits at least this far from the text
 * column; chips are one 24px target tall. */
const RAIL_GAP = 24;
const CHIP_H = 24;
const CHIP_MAX_REM = 10;
/** Narrower than this, a chip shows its icon only. */
const CHIP_LABEL_MIN = 56;

type Box = { x: number; y: number; w: number; h: number };
/** lines: distinct text lines the span covers — 1 = circle it, 2+ = bracket */
type Placement = {
  annotation: Annotation;
  box: Box;
  lines: number;
  colSide: "left" | "right"; // which column of the spread the span sits in
  laneCenter: { x: number; y: number };
  /** Default box width: LANE, narrower when the pane's lanes shrink (#51). */
  laneWidth: number;
};
/** A note anchor's mark: same circle/bracket by geometry, plus a static chip
 * beside it that opens the document panel. One tab per anchor — a multi-anchor
 * note draws a mark at each of its spans in this chapter. */
type NoteTab = {
  mark: NoteMark;
  box: Box;
  lines: number;
  colSide: "left" | "right";
  /** Vertical center of the mark's first visible line — its chip sits level. */
  firstLineY: number;
};

/** A circle/bracket on the words, in the content box's page-independent
 * space (drawn in the layer that slides with the text). One per page an
 * anchor's words fall on. */
type Pen = {
  key: string;
  /** Annotation id, or the note mark's "note:<noteId>:<anchorId>". */
  markId: string;
  isNote: boolean;
  box: Box;
  lines: number;
  colSide: "left" | "right";
};

/** Where the margin rail is (region-local px), measured with the anchors. */
type RailEdges = { leftEnd: number; rightStart: number; width: number; rem: number };

/** Box center, width and arrow endpoints, honoring an active drag/resize,
 * then stored placement, then the default lane. */
function geom(
  p: Placement,
  drag: { id: string; x: number; y: number } | null,
  resize: { id: string; cx: number; w: number } | null,
  boxH = 22, // measured handwriting-box height (default: one line)
) {
  const aCX = p.box.x + p.box.w / 2;
  const aCY = p.box.y + p.box.h / 2;
  let cx: number;
  let cy: number;
  if (drag && drag.id === p.annotation.id) {
    ({ x: cx, y: cy } = drag);
  } else if (p.annotation.offsetX != null && p.annotation.offsetY != null) {
    cx = aCX + p.annotation.offsetX;
    cy = aCY + p.annotation.offsetY;
  } else {
    ({ x: cx, y: cy } = p.laneCenter);
  }
  let w = p.annotation.width ?? p.laneWidth;
  if (resize && resize.id === p.annotation.id) {
    cx = resize.cx;
    w = resize.w;
  }
  const side: "left" | "right" = cx < aCX ? "left" : "right";
  // Flip to the top approach as soon as the annotation rises past the circle's
  // centerline (small bias keeps untouched lane annotations on the classic
  // under-run) — flipping later forces a hard bend near the arrowhead.
  const above = cy < aCY - 4;
  const noteEdgeX = side === "left" ? cx + w / 2 : cx - w / 2;
  let anchorX: number;
  let anchorY: number;
  if (p.lines > 1) {
    // Bracketed span: bind to the bracket's spine, at the annotation's height.
    // The bracket lives on the span's outer-margin side (its column side).
    anchorX =
      p.colSide === "left" ? p.box.x - BRACKET_GAP - 3 : p.box.x + p.box.w + BRACKET_GAP + 3;
    anchorY = Math.min(Math.max(cy, p.box.y + 8), p.box.y + p.box.h - 8);
  } else {
    // Circled span: land anywhere along the loop's arc, at the point facing
    // the annotation, the landing height following the ellipse's curve.
    const rx = p.box.w / 2 + SCRIBBLE_PAD_X;
    const ry = p.box.h / 2 + SCRIBBLE_PAD_Y;
    const t = Math.min(Math.max((cx - p.box.x) / p.box.w, 0.02), 0.98);
    const ex = (t - 0.5) * p.box.w; // x-offset from the loop's center
    const bulge = ry * Math.sqrt(Math.max(0, 1 - (ex / rx) ** 2));
    anchorX = p.box.x + p.box.w * t;
    anchorY = above ? aCY - bulge - 5 : aCY + bulge + 5;
  }
  // Box parked above/below its mark (landing point under the text): the
  // arrow departs bottom/top-CENTER, not the side edge — a side departure at
  // text height strikes through the handwriting.
  const vertical = anchorX > cx - w / 2 && anchorX < cx + w / 2;
  const departX = vertical ? cx : noteEdgeX;
  const departY = vertical ? (above ? cy + boxH / 2 + 3 : cy - boxH / 2 - 3) : cy;
  return {
    cx,
    cy,
    w,
    side,
    boxLeft: cx - w / 2,
    departX,
    departY,
    anchorX,
    anchorY,
    approach: (above ? "down" : "up") as "up" | "down",
    // A box parked beside its circle needs no arrow — that's the gloss look
    showArrow: Math.hypot(departX - anchorX, departY - anchorY) > ARROW_MIN_DIST,
  };
}

export function AnnotationMarks({
  annotations,
  noteMarks,
  regionRef,
  contentRef,
  flowRef,
  page = 0,
  stride = 0,
  penHost,
  marginHidden = false,
  layoutKey,
  activeAnnotationId,
  selectedMarkId,
  compact = false,
  marginBoxes = true,
  railChips = true,
  onFocus,
  onEdit,
  onRemove,
  onPlace,
  onOpenNote,
}: {
  annotations: Annotation[];
  noteMarks: NoteMark[];
  regionRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  /** The text flow (carries the page-turn transform). */
  flowRef: RefObject<HTMLElement | null>;
  /** Desktop paging: current page and its width in px (0 = one scroll column). */
  page?: number;
  stride?: number;
  /** Where circles/brackets render: a layer inside the content box that
   * slides with the text, so they turn with their page (#ink slides). */
  penHost: HTMLElement | null;
  /** Mid page-turn: margin boxes, arrows and chips (fixed to the pane) wait
   * out the slide, then fade in at the new page's spots. */
  marginHidden?: boolean;
  /** Anything that moves the words without resizing the boxes (page,
   * stride, column count, text size) — re-measure on change. */
  layoutKey: string;
  activeAnnotationId: string | null;
  /** Mark of the reference selected in the note panel — while set, every
   * other mark's ink is hidden so this one owns the page. */
  selectedMarkId: string | null;
  /** Phone view (#13, #44): single scroll column — brackets sit on the left. */
  compact?: boolean;
  /** Handwriting boxes + arrows in the margin lanes. False when there are no
   * lanes (phones, narrow panes): ChapterText prints each annotation as a
   * line under its verse instead (#63) — circles/brackets stay here. */
  marginBoxes?: boolean;
  /** Note chips in the margin rail (desktop). False on phones: a marker
   * after the verse number instead (#63). */
  railChips?: boolean;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onPlace: (id: string, patch: { offsetX?: number; offsetY?: number; width?: number }) => void;
  onOpenNote: (id: string) => void;
}) {
  const spotlight =
    selectedMarkId != null &&
    noteMarks.some((m) => `note:${m.noteId}:${m.id}` === selectedMarkId);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pens, setPens] = useState<Pen[]>([]);
  const { t } = useTranslation();
  // Current sheet scale (mobile, #13) — pointer deltas are visual px, box
  // coordinates local px
  const scaleRef = useRef(1);
  const [noteTabs, setNoteTabs] = useState<NoteTab[]>([]);
  const [rail, setRail] = useState<RailEdges | null>(null);
  // Spotlight: only the selected reference's mark is drawn
  const shownPlacements = spotlight ? [] : placements;
  const shownTabs = spotlight
    ? noteTabs.filter((m) => selectedMarkId === `note:${m.mark.noteId}:${m.mark.id}`)
    : noteTabs;
  const [regionSize, setRegionSize] = useState({ w: 0, h: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; cx: number; w: number } | null>(null);
  const boxHeights = useRef(new Map<string, number>());
  const [, remeasured] = useState(0);
  const measureBox = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    const h = el.offsetHeight;
    if (boxHeights.current.get(id) !== h) {
      boxHeights.current.set(id, h);
      remeasured((n) => n + 1); // arrows re-derive from the fresh height
    }
  };
  const dragFrom = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const resizeFrom = useRef<{
    edge: "left" | "right";
    px: number;
    startW: number;
    fixedX: number;
  } | null>(null);
  const didDrag = useRef(false);

  // Cancel edit when clicking outside the open editor.
  useEffect(() => {
    if (!editingId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-annotation-editing]")) setEditingId(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [editingId]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    const content = contentRef.current;
    const flowEl = flowRef.current;
    if (!region || !content || !flowEl) return;

    const measure = () => {
      const regionRect = region.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      // Mobile sheet-scale (#13): rects are visual (scaled) px, overlays paint
      // in the region's local space — divide the scale out everywhere.
      const s = regionRect.width / region.offsetWidth || 1;
      scaleRef.current = s;
      setRegionSize({ w: region.offsetWidth, h: region.offsetHeight });
      const leftLaneRight = (contentRect.left - regionRect.left) / s - GAP;
      const rightLaneLeft = (contentRect.right - regionRect.left) / s + GAP;
      const contentLeft = (contentRect.left - regionRect.left) / s;
      const contentRight = (contentRect.right - regionRect.left) / s;
      // The text column's own edges (inside the content box's padding): the
      // note rail keeps RAIL_GAP clear of them
      const pad = getComputedStyle(content);
      const textLeft = contentLeft + (parseFloat(pad.paddingLeft) || 0);
      const textRight = contentRight - (parseFloat(pad.paddingRight) || 0);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setRail({
        leftEnd: textLeft - RAIL_GAP,
        rightStart: textRight + RAIL_GAP,
        width: region.offsetWidth,
        rem,
      });

      // Words are measured relative to the flow (its page-turn transform
      // cancels out), in the content box's space: x of page n's words runs
      // from n·stride. Margin items convert to the pane for the current page.
      const flowRect = flowEl.getBoundingClientRect();
      const ox = flowEl.offsetLeft;
      const oy = flowEl.offsetTop;
      const toRegionX = contentLeft - page * stride;
      const boxTop = (contentRect.top - regionRect.top) / s;
      const pageOfX = (x: number) => (stride > 0 ? Math.max(0, Math.floor((x - ox) / stride)) : 0);
      /** Content-box center of page n — which column a span sits in. */
      const midOf = (n: number) => n * stride + content.offsetWidth / 2;

      type Seg = { page: number; box: Box; lines: number; mid: number; firstLineY: number };
      /** An anchor's words, one segment per page (box + line count),
       * measured straight from the [data-verse][data-word] spans —
       * independent of any wrapper, so overlapping/nested marks all measure
       * correctly. Content-box space. */
      const measureAnchor = (a: {
        startVerse: number;
        startWord: number;
        endVerse: number;
        endWord: number;
      }): Seg[] => {
        const byPage = new Map<number, Rect[]>();
        for (let v = a.startVerse; v <= a.endVerse; v++) {
          const els = flowEl.querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
          for (const el of els) {
            const w = Number(el.dataset.word);
            if (v === a.startVerse && w < a.startWord) continue;
            if (v === a.endVerse && w > a.endWord) continue;
            const vr = el.getBoundingClientRect();
            if (vr.width === 0) continue;
            const r = {
              left: (vr.left - flowRect.left) / s + ox,
              top: (vr.top - flowRect.top) / s + oy,
              right: (vr.right - flowRect.left) / s + ox,
              bottom: (vr.bottom - flowRect.top) / s + oy,
            };
            const n = pageOfX(r.left);
            byPage.set(n, [...(byPage.get(n) ?? []), r]);
          }
        }
        return [...byPage].map(([n, rects]) => {
          const left = Math.min(...rects.map((r) => r.left));
          const right = Math.max(...rects.map((r) => r.right));
          const top = Math.min(...rects.map((r) => r.top));
          const bottom = Math.max(...rects.map((r) => r.bottom));
          // Distinct (line, column) clusters — same top in the other column of
          // the spread is a different line
          const runs = lineRuns(rects);
          return {
            page: n,
            box: { x: left, y: top, w: right - left, h: bottom - top },
            lines: runs.length,
            mid: (left + right) / 2,
            firstLineY: (runs[0].top + runs[0].bottom) / 2,
          };
        });
      };
      const sideOf = (seg: Seg): "left" | "right" => (compact || seg.mid < midOf(seg.page) ? "left" : "right");
      /** The current page's segment, in pane (region) coordinates. */
      const onPage = (segs: Seg[]) => {
        const seg = segs.find((g) => g.page === page);
        if (!seg) return null;
        return {
          box: { ...seg.box, x: seg.box.x + toRegionX, y: seg.box.y + boxTop },
          lines: seg.lines,
          side: sideOf(seg),
          firstLineY: seg.firstLineY + boxTop,
        };
      };
      const penList: Pen[] = [];

      const items: Placement[] = [];
      for (const annotation of annotations) {
        const segs = measureAnchor(annotation);
        for (const g of segs)
          penList.push({ key: `${annotation.id}:${g.page}`, markId: annotation.id, isNote: false, box: g.box, lines: g.lines, colSide: sideOf(g) });
        const m = onPage(segs);
        if (!m) continue;
        // One scroll column (phones): brackets always on the left gutter
        const side = m.side;
        // Narrow pane (#51): lanes shrink — the default box narrows to the
        // room left (wrapping its text), stays on screen and clear of the
        // edge page-flip strips
        const room =
          side === "left" ? leftLaneRight - EDGE : region.offsetWidth - EDGE - rightLaneLeft;
        const laneWidth = Math.min(LANE, Math.max(MIN_W, room));
        items.push({
          annotation,
          box: m.box,
          lines: m.lines,
          colSide: side,
          laneWidth,
          laneCenter: {
            x:
              side === "left"
                ? Math.max(EDGE + laneWidth / 2, leftLaneRight - laneWidth / 2)
                : Math.min(region.offsetWidth - EDGE - laneWidth / 2, rightLaneLeft + laneWidth / 2),
            y: m.box.y + m.box.h / 2,
          },
        });
      }
      setPlacements(items);

      const tabs: NoteTab[] = [];
      for (const mark of noteMarks) {
        const segs = measureAnchor(mark);
        const markId = `note:${mark.noteId}:${mark.id}`;
        for (const g of segs)
          penList.push({ key: `${markId}:${g.page}`, markId, isNote: true, box: g.box, lines: g.lines, colSide: sideOf(g) });
        const m = onPage(segs);
        if (m) tabs.push({ mark, box: m.box, lines: m.lines, colSide: m.side, firstLineY: m.firstLineY });
      }
      setNoteTabs(tabs);
      setPens(penList);
    };

    measure();
    // Once webfonts land (Literata swaps in -> lines rewrap under fixed-size boxes)
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    const ro = new ResizeObserver(measure);
    ro.observe(region);
    ro.observe(content);
    ro.observe(flowEl);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [annotations, noteMarks, layoutKey, regionRef, contentRef, flowRef, compact, page, stride]);

  // Note chips in the margin rail (#63): beside the mark's first line,
  // stacked clear of each other and of default-placed annotation boxes.
  const chips =
    railChips && rail
      ? placeRailChips(
          shownTabs.map((m) => ({
            id: m.mark.id,
            side: m.colSide,
            centerY: m.firstLineY,
          })),
          {
            leftEnd: rail.leftEnd,
            rightStart: rail.rightStart,
            regionWidth: rail.width,
            edge: 8,
            chipH: CHIP_H,
            gap: 4,
            maxWidth: CHIP_MAX_REM * rail.rem,
            obstacles: marginBoxes
              ? shownPlacements
                  .filter((p) => p.annotation.offsetX == null)
                  .map((p) => {
                    const h = boxHeights.current.get(p.annotation.id) ?? 22;
                    return { side: p.colSide, top: p.laneCenter.y - h / 2, bottom: p.laneCenter.y + h / 2 };
                  })
              : [],
          },
        )
      : null;
  const chipById = new Map(chips?.map((c) => [c.id, c]) ?? []);
  // Spotlight: annotations hide, of the notes only the selected mark stays
  const shownPens = spotlight ? pens.filter((p) => p.markId === selectedMarkId) : pens;
  /** Hidden at once when a turn starts; fades back in on the new page. */
  const fade = marginHidden ? "opacity-0" : "opacity-100 transition-opacity duration-200";

  return (
    <>
      {/* Leader arrows render BELOW the text (negative z): the stroke dips
          under the line of words and surfaces in the word spaces. The
          selected reference's wash paints here too — marker behind the text,
          never a layer over it. */}
      {penHost &&
        createPortal(
          <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            {shownPens.map((p) => {
              const active = p.markId === activeAnnotationId || p.markId === selectedMarkId;
              return (
                <path
                  key={p.key}
                  d={
                    p.lines > 1
                      ? bracketPath(
                          p.colSide === "left" ? p.box.x - BRACKET_GAP : p.box.x + p.box.w + BRACKET_GAP,
                          p.box.y + 2,
                          p.box.y + p.box.h - 2,
                          p.markId.split(":").at(-1) ?? p.markId,
                          p.colSide === "left" ? 1 : -1,
                        )
                      : scribblePath(p.box.x, p.box.y, p.box.w, p.box.h, p.markId.split(":").at(-1) ?? p.markId)
                  }
                  fill="none"
                  stroke={NOTE_INK}
                  strokeWidth={active ? 2 : 1.5}
                  strokeLinecap="round"
                  opacity={active ? 1 : 0.75}
                />
              );
            })}
          </svg>,
          penHost,
        )}

      <svg
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible", fade)}
      >
        {marginBoxes &&
          shownPlacements.map((p) => {
            const g = geom(p, drag, resize, boxHeights.current.get(p.annotation.id));
            if (!g.showArrow) return null;
            const active = p.annotation.id === activeAnnotationId;
            return (
              <path
                key={p.annotation.id}
                d={leaderPath(g.departX, g.departY, g.anchorX, g.anchorY, p.annotation.id, g.approach)}
                fill="none"
                stroke={NOTE_INK}
                strokeWidth={active ? 1.8 : 1.4}
                strokeLinecap="round"
                opacity={active ? 1 : 0.75}
              />
            );
          })}
      </svg>

      <div className={cn("pointer-events-none absolute inset-0 z-10", fade, marginHidden && "[&_*]:pointer-events-none!")}>
        {/* Note links: a typeset chip (index-tab, NOT handwriting) in the
            margin rail level with the mark's first line — never on the
            running text (#63) */}
        {shownTabs.map((m) => {
          const chip = chipById.get(m.mark.id);
          if (!chip) return null;
          const title = m.mark.title || t("note.untitled");
          const labelled = chip.width >= CHIP_LABEL_MIN;
          return (
            <button
              key={m.mark.id}
              type="button"
              data-ink-box
              {...{ [NOTE_OPENER]: m.mark.id }}
              aria-label={t("reader.openNoteNamed", { title })}
              title={title}
              onClick={() => onOpenNote(m.mark.noteId)}
              className={cn(
                "pointer-events-auto absolute flex h-6 items-center",
                chip.side === "left" ? "justify-end" : "justify-start",
                focusRing,
                "rounded-full",
              )}
              style={{ left: chip.x, top: chip.y, width: chip.width }}
            >
              <span
                className={cn(
                  "flex h-5 max-w-full items-center gap-1 overflow-hidden rounded-full border bg-popover font-sans text-meta leading-none whitespace-nowrap transition-colors hover:bg-accent",
                  labelled ? "px-1.5" : "w-5 justify-center",
                )}
                style={{ color: NOTE_INK_TEXT, borderColor: NOTE_INK }}
              >
                <FileText className="size-3 shrink-0" />
                {labelled && <span className="overflow-hidden text-ellipsis">{title}</span>}
              </span>
            </button>
          );
        })}

        {marginBoxes &&
          shownPlacements.map((p) => {
            const active = p.annotation.id === activeAnnotationId;
            const isEditing = editingId === p.annotation.id;
            const g = geom(p, drag, resize, boxHeights.current.get(p.annotation.id));
            const dragging = drag?.id === p.annotation.id;
            return (
              <div
                key={p.annotation.id}
                ref={measureBox(p.annotation.id)}
                data-ink-box
                className={`pointer-events-auto absolute -translate-y-1/2 ${dragging ? "select-none" : ""}`}
                style={{
                  left: g.boxLeft,
                  top: g.cy,
                  width: g.w,
                  textAlign: g.side === "left" ? "right" : "left",
                }}
                onPointerEnter={() => onFocus(p.annotation.id)}
                onPointerLeave={() => !isEditing && onFocus(null)}
                onPointerDown={(e) => {
                  if (isEditing || e.button !== 0) return;
                  dragFrom.current = { cx: g.cx, cy: g.cy, px: e.clientX, py: e.clientY };
                  didDrag.current = false;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const from = dragFrom.current;
                  if (!from) return;
                  const dx = (e.clientX - from.px) / scaleRef.current;
                  const dy = (e.clientY - from.py) / scaleRef.current;
                  if (!didDrag.current && Math.hypot(dx, dy) < 4) return;
                  didDrag.current = true;
                  setDrag({
                    id: p.annotation.id,
                    x: Math.min(Math.max(from.cx + dx, g.w / 2), regionSize.w - g.w / 2),
                    y: Math.min(Math.max(from.cy + dy, 12), regionSize.h - 12),
                  });
                }}
                onPointerUp={() => {
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (!from) return;
                  if (didDrag.current && drag?.id === p.annotation.id) {
                    const aCX = p.box.x + p.box.w / 2;
                    const aCY = p.box.y + p.box.h / 2;
                    onPlace(p.annotation.id, { offsetX: drag.x - aCX, offsetY: drag.y - aCY });
                  }
                  setDrag(null);
                }}
              >
                {!isEditing &&
                  (["left", "right"] as const).map((edge) => (
                    <div
                      key={edge}
                      aria-hidden
                      className={`absolute inset-y-0 ${edge === "left" ? "-left-1.5" : "-right-1.5"} w-3 cursor-ew-resize`}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        resizeFrom.current = {
                          edge,
                          px: e.clientX,
                          startW: g.w,
                          // The opposite edge stays pinned so the arrow doesn't jump
                          fixedX: edge === "left" ? g.cx + g.w / 2 : g.cx - g.w / 2,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const from = resizeFrom.current;
                        if (!from) return;
                        e.stopPropagation();
                        const dx = (e.clientX - from.px) / scaleRef.current;
                        const w = Math.min(
                          Math.max(from.edge === "right" ? from.startW + dx : from.startW - dx, MIN_W),
                          MAX_W,
                        );
                        didDrag.current = true;
                        setResize({
                          id: p.annotation.id,
                          w,
                          cx: from.edge === "right" ? from.fixedX + w / 2 : from.fixedX - w / 2,
                        });
                      }}
                      onPointerUp={(e) => {
                        const from = resizeFrom.current;
                        resizeFrom.current = null;
                        if (!from) return;
                        e.stopPropagation();
                        if (resize?.id === p.annotation.id) {
                          const aCX = p.box.x + p.box.w / 2;
                          const aCY = p.box.y + p.box.h / 2;
                          onPlace(p.annotation.id, {
                            width: resize.w,
                            offsetX: resize.cx - aCX,
                            offsetY: g.cy - aCY,
                          });
                        }
                        setResize(null);
                      }}
                    />
                  ))}
                {isEditing ? (
                  <AnnotationEditor
                    text={p.annotation.text}
                    onSave={(text) => {
                      onEdit(p.annotation.id, text);
                      setEditingId(null);
                    }}
                    onRemove={() => {
                      onRemove(p.annotation.id);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  // A real button (#61): Enter/Space open the editor too
                  <button
                    type="button"
                    title={p.annotation.text}
                    onClick={() => {
                      if (didDrag.current) {
                        didDrag.current = false;
                        return; // a drag, not a click
                      }
                      setEditingId(p.annotation.id);
                    }}
                    className={cn(
                      "-mx-1 block w-[calc(100%+0.5rem)] rounded-sm px-1 font-serif text-list leading-snug italic transition-colors hover:bg-accent/50",
                      dragging ? "cursor-grabbing" : "cursor-grab",
                      focusRing,
                    )}
                    style={{
                      color: active ? NOTE_INK_TEXT_ACTIVE : NOTE_INK_TEXT,
                      textAlign: "inherit",
                    }}
                  >
                    {p.annotation.text}
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
}
