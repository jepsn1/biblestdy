import { useTranslation } from "react-i18next";
import type { Annotation, AnnotationMark } from "@biblestdy/shared";
import { FileText, Files } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { bookLocale, useBookName } from "~/lib/book-name";
import { referenceLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { AnnotationEditor } from "./annotation-editor";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE } from "./highlight-colors";
import {
  bracketLanes,
  columnOf,
  connectorPath,
  LANE_STEP,
  lineRuns,
  needsConnector,
  pageOfColumn,
  sideOfSpan,
  placeRailChips,
  type LaneSpan,
  type PagedFlow,
  type Rect,
} from "./ink-geometry";
import { markReference, type NoteMark } from "./note-marks";
import { GUTTER } from "./sheet-layout";
import { linkedHint } from "./linked-hint";
import { SPOT_FADE, touchesSpot, type SpotRange } from "./spotlight";
import { NOTE_OPENER } from "./note-panel";
import { sameData, useMeasure, useSameData } from "./use-measure";
import {
  bracketPath,
  leaderPath,
  SCRIBBLE_PAD_X,
  SCRIBBLE_PAD_Y,
  contourPath,
  roundedScribblePath,
  scribblePath,
  underlinePath,
} from "./scribble";
import type { Place } from "./reading-place";

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
const EDGE = 64; // px kept clear at the pane edges (sheet-layout GUTTER, 60px: the tool palette, left)
const ARROW_MIN_DIST = 40; // box closer than this to the circle: no arrow

const BRACKET_GAP = 10; // bracket spine sits this far left of the span's lines
/** Phones (#215): no margin — a note link's gutter bracket hugs the text. */
const GUTTER_GAP = 4;

/** Note labels (#63, #211): the margin rail sits at least this far from the
 * text column (rem: the bracket lanes and the connector live in it); a
 * label is one 24px target tall at 100% and scales with the text size. */
const RAIL_GAP_REM = 1.5;
const CHIP_H_REM = 1.5;
const CHIP_GAP_REM = 0.25;
const CHIP_MAX_REM = 10;
/** Narrower than this, a label shows its icon only (#211). */
const CHIP_LABEL_MIN_REM = 7.5;

type Box = { x: number; y: number; w: number; h: number };
/** lines: distinct text lines the span covers — 1 = circle it, 2+ = bracket */
type Placement = {
  annotation: Annotation;
  box: Box;
  /** Column edge on the bracket side (pane space), see Pen.edge. */
  edge: number;
  lines: number;
  colSide: "left" | "right"; // which column of the spread the span sits in
  laneCenter: { x: number; y: number };
  /** Default box width: LANE, narrower when the pane's lanes shrink (#51). */
  laneWidth: number;
  /** How these words are marked (stored choice, else by line count). */
  shape: AnnotationMark;
  /** One placement per text column the span falls in: `annotation id:column`. */
  key: string;
  /** A span split across columns shows its box again beside the rest of
   * its words — layout only, never stored. A copy sits at its lane spot
   * (no drag/resize); the original (first column) keeps the stored place. */
  copy: boolean;
};
/** A note anchor's mark: same circle/bracket by geometry, plus a static chip
 * beside it that opens the document panel. One tab per anchor — a multi-anchor
 * note draws a mark at each of its spans in this chapter. */
type NoteTab = {
  /** The label's own id: the mark's, or a group's ("group:<col>:<ids>"). */
  id: string;
  /** The link it names — or, for a group (#211), every link folded in. */
  marks: NoteMark[];
  group: boolean;
  colSide: "left" | "right";
  /** Vertical center of the bracket's first line — the label sits level. */
  firstLineY: number;
  /** The first line's height: the connector rule's half a line. */
  lineH: number;
  /** The bracket's top hook (pane space): where a connector starts. */
  hook: { x: number; y: number };
};

/** A circle/bracket on the words, in the content box's page-independent
 * space (drawn in the layer that slides with the text). One per page an
 * anchor's words fall on. */
type Pen = {
  key: string;
  /** Annotation id, or the note mark's "note:<noteId>:<anchorId>". */
  markId: string;
  isNote: boolean;
  /** A note link's lane (#211): this many LANE_STEPs out from the text. */
  lane?: number;
  /** A group bracket's links (#211): the marks folded into it. */
  members?: NoteMark[];
  /** The page its words are on (note links: the bracket's hit strip). */
  page?: number;
  box: Box;
  lines: number;
  /** The marked words' line runs (content-box space): contour + underline. */
  runs: Rect[];
  /** The text column's edge on the bracket side (clear of indents and verse numbers). */
  edge: number;
  colSide: "left" | "right";
  shape: AnnotationMark;
};

/** Stored choice, else auto: one line circled, several bracketed. */
const shapeOf = (mark: AnnotationMark | null | undefined, lines: number): AnnotationMark =>
  mark ?? (lines > 1 ? "bracket" : "circle");

/** One mark's ink: bracket beside the lines, a loop round one line (a
 * rounded loop round several), a box that follows the words, or an underline. */
function penPath(
  shape: AnnotationMark,
  box: Box,
  lines: number,
  runs: Rect[],
  side: "left" | "right",
  edge: number,
  seed: string,
  lane = 0,
  gap = BRACKET_GAP,
) {
  if (shape === "contour") return contourPath(runs, seed);
  if (shape === "underline") return underlinePath(runs, seed);
  if (shape === "bracket")
    return bracketPath(
      spineX(box, side, edge, lane, gap),
      box.y + 2,
      box.y + box.h - 2,
      seed,
      side === "left" ? 1 : -1,
    );
  return lines > 1 ? roundedScribblePath(box.x, box.y, box.w, box.h, seed) : scribblePath(box.x, box.y, box.w, box.h, seed);
}

/** A bracket's spine: BRACKET_GAP off the text column, a lane further out
 * per nested note link (#211). */
const spineX = (box: Box, side: "left" | "right", edge: number, lane = 0, gap = BRACKET_GAP) =>
  side === "left"
    ? Math.min(box.x, edge) - gap - lane * LANE_STEP
    : Math.max(box.x + box.w, edge) + gap + lane * LANE_STEP;

/** Where the margin rail is (region-local px), measured with the anchors. */
type RailEdges = { leftEnd: number; rightStart: number; width: number; rem: number };

/** An anchor's words in one text column (content-box space, every page). */
type Seg = {
  col: number;
  page: number;
  box: Box;
  lines: number;
  runs: Rect[];
  /** The column's edges; `side` picks the bracket's. */
  edgeL: number;
  edgeR: number;
  side: "left" | "right";
  /** The column's own side of the page: a spread's left column "left", its
   * right one (or a single column) "right" — where a verse-level chip goes. */
  colSide: "left" | "right";
  firstLineY: number;
  /** The first line's height. */
  lineH: number;
};

/** Everything the ink layer reads from the DOM, page-independent: margin
 * items project it onto the current page without re-measuring. */
type InkGeometry = {
  region: { w: number; h: number };
  rail: RailEdges;
  leftLaneRight: number;
  rightLaneLeft: number;
  /** Content box left / top in the region (page 0's position). */
  contentLeft: number;
  boxTop: number;
  stride: number;
  /** Segments per annotation id, and per note mark ("note:<noteId>:<id>"). */
  anchors: Record<string, Seg[]>;
};
const NO_REGION = { w: 0, h: 0 };

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
  if (!p.copy && drag && drag.id === p.annotation.id) {
    ({ x: cx, y: cy } = drag);
  } else if (!p.copy && p.annotation.offsetX != null && p.annotation.offsetY != null) {
    cx = aCX + p.annotation.offsetX;
    cy = aCY + p.annotation.offsetY;
  } else {
    ({ x: cx, y: cy } = p.laneCenter);
  }
  let w = p.annotation.width ?? p.laneWidth;
  if (!p.copy && resize && resize.id === p.annotation.id) {
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
  if ((p.shape === "circle" && p.lines > 1) || p.shape === "contour" || p.shape === "underline") {
    // Rounded loop round a block: land on the edge facing the annotation
    const l = p.box.x - SCRIBBLE_PAD_X;
    const r = p.box.x + p.box.w + SCRIBBLE_PAD_X;
    if (cx < l || cx > r) {
      anchorX = cx < l ? l - 3 : r + 3;
      anchorY = Math.min(Math.max(cy, p.box.y + 8), p.box.y + p.box.h - 8);
    } else {
      anchorX = cx;
      anchorY = above ? p.box.y - SCRIBBLE_PAD_Y - 5 : p.box.y + p.box.h + SCRIBBLE_PAD_Y + 5;
    }
  } else if (p.shape === "bracket") {
    // Bracketed span: bind to the bracket's spine, at the annotation's height.
    // The bracket lives on the span's outer-margin side (its column side).
    anchorX =
      p.colSide === "left"
        ? Math.min(p.box.x, p.edge) - BRACKET_GAP - 3
        : Math.max(p.box.x + p.box.w, p.edge) + BRACKET_GAP + 3;
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
  annotations: annotationsProp,
  noteMarks: noteMarksProp,
  regionRef,
  contentRef,
  flowRef,
  scopeRef,
  page = 0,
  stride = 0,
  penHost,
  marginHidden = false,
  layoutKey,
  activeAnnotationId,
  spot = null,
  hover = null,
  onHoverMark,
  openNoteId = null,
  eraser = false,
  compact = false,
  noteInkHidden = false,
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
  /** The chapter's own part of the flow, where its words are looked up — a
   * page can carry two chapters (verse numbers repeat). Default: the flow. */
  scopeRef?: RefObject<HTMLElement | null>;
  /** Desktop paging: current page and its width in px (0 = one scroll column). */
  page?: number;
  stride?: number;
  /** Where circles/brackets render: a layer inside the content box that
   * slides with the text, so they turn with their page (#ink slides). */
  penHost: HTMLElement | null;
  /** Mid page-turn: margin boxes, arrows and chips (fixed to the pane) wait
   * out the slide, then fade in at the new page's spots. */
  marginHidden?: boolean;
  /** Anything that moves the words without resizing the boxes (stride,
   * column count, text size) — re-measure on change. A page turn only
   * re-projects the margin items: the words themselves don't move. */
  layoutKey: string;
  activeAnnotationId: string | null;
  /** The spotlit reference (#210): its bracket strongest and only its label
   * shown, filled; other notes' brackets and the reader's own marks outside
   * its verses step back — never hidden. */
  spot?: SpotRange | null;
  /** The link hovered (or focused) in the note — its chip or row (#213):
   * drawn as spotlit, nothing else steps back. Ignored under a spotlight. */
  hover?: SpotRange | null;
  /** Pointer or focus on the open note's bracket or label (#213): its chips
   * and row answer (null: gone). */
  onHoverMark?: (markKey: string | null) => void;
  /** The note open in the side panel (#211): its links' brackets and labels
   * step up, every other note's step back by colour. The spotlight
   * outranks it. */
  openNoteId?: string | null;
  /** The eraser is the tool (#211): a bracket's strip says where to remove
   * the link instead — links are never erased on the page. */
  eraser?: boolean;
  /** Phone view (#13, #44): single scroll column — brackets sit on the left.
   * A note link's gutter bracket (#215): 1.5px, close to the text, from the
   * line of its verse's marker. */
  compact?: boolean;
  /** Phone, the note drawer full (#215): the gutter brackets step out — the
   * open note's passage shows its wash above the drawer. */
  noteInkHidden?: boolean;
  /** Handwriting boxes + arrows in the margin lanes. False when there are no
   * lanes (phones, narrow panes): ChapterText prints each annotation as a
   * line under its verse instead (#63) — circles/brackets stay here. */
  marginBoxes?: boolean;
  /** Note chips in the margin rail (desktop). False on phones: a marker
   * after the verse number instead (#63). */
  railChips?: boolean;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, text: string | null) => void;
  onRemove: (id: string) => void;
  onPlace: (
    id: string,
    patch: { offsetX?: number; offsetY?: number; width?: number; mark?: AnnotationMark | null },
  ) => void;
  /** `at`: the mark's first word — the reader keeps it in view (#203). */
  onOpenNote: (id: string, at?: Place) => void;
}) {
  // Rebuilt by the caller on every render: only new data re-measures
  const annotations = useSameData(annotationsProp);
  const noteMarks = useSameData(noteMarksProp);
  const spotlight = spot != null;
  const spotMark = spot?.markId ?? null;
  const { t, i18n } = useTranslation();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  /** The open note, unless a spotlight outranks it (#211). */
  const openNote = spotlight ? null : openNoteId;
  // Current sheet scale (mobile, #13) — pointer deltas are visual px, box
  // coordinates local px
  const scaleRef = useRef(1);
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

  // Measured: page-independent (every page's words, content-box space) —
  // a page turn only re-projects (below), it never re-reads the layout
  const [geo, setGeo] = useState<InkGeometry | null>(null);
  useMeasure(
    () => [regionRef.current, contentRef.current, flowRef.current],
    () => {
      const region = regionRef.current;
      const content = contentRef.current;
      const flowEl = flowRef.current;
      if (!region || !content || !flowEl) return;
      const regionRect = region.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      // Mobile sheet-scale (#13): rects are visual (scaled) px, overlays paint
      // in the region's local space — divide the scale out everywhere.
      const s = regionRect.width / region.offsetWidth || 1;
      scaleRef.current = s;
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

      // Words are measured relative to the flow (its page-turn transform
      // cancels out), in the content box's space: x of page n's words runs
      // from n·stride. Margin items convert to the pane for the current page.
      const flowRect = flowEl.getBoundingClientRect();
      const ox = flowEl.offsetLeft;
      const oy = flowEl.offsetTop;
      /** Content-box center of page n — which column a span sits in. */
      const midOf = (n: number) => n * stride + content.offsetWidth / 2;

      // Text columns repeat every colStride (spread: 2 per page); a span
      // split across columns gets one segment per column
      const flowStyle = getComputedStyle(flowEl);
      const colCount = Number(flowStyle.columnCount) || 1;
      const colGap = parseFloat(flowStyle.columnGap) || 0;
      const colStride = (flowEl.clientWidth - colGap * (colCount - 1)) / colCount + colGap;
      const flow: PagedFlow = { x: ox, colStride, pageStride: stride };
      const colWidth = colStride - colGap;
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
          const els = (scopeRef?.current ?? flowEl).querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
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
            const n = columnOf(r, flow);
            byPage.set(n, [...(byPage.get(n) ?? []), r]);
          }
        }
        return [...byPage].sort((x, y) => x[0] - y[0]).map(([n, rects]) => {
          const left = Math.min(...rects.map((r) => r.left));
          const right = Math.max(...rects.map((r) => r.right));
          const top = Math.min(...rects.map((r) => r.top));
          const bottom = Math.max(...rects.map((r) => r.bottom));
          // Distinct (line, column) clusters — same top in the other column of
          // the spread is a different line
          const runs = lineRuns(rects);
          // By the column, not the words' left edge (#164)
          const page = pageOfColumn(n, flow);
          return {
            col: n,
            page,
            box: { x: left, y: top, w: right - left, h: bottom - top },
            lines: runs.length,
            runs,
            edgeL: ox + n * colStride,
            edgeR: ox + n * colStride + colWidth,
            side: compact ? "left" : sideOfSpan(left, right, midOf(page)),
            colSide: compact || ox + n * colStride + colWidth / 2 < midOf(page) - colWidth / 4 ? "left" : "right",
            firstLineY: (runs[0].top + runs[0].bottom) / 2,
            lineH: runs[0].bottom - runs[0].top,
          };
        });
      };
      const anchors: InkGeometry["anchors"] = {};
      for (const annotation of annotations) anchors[annotation.id] = measureAnchor(annotation);
      // Phones: from the verse's first word, level with its marker (#215)
      for (const mark of noteMarks)
        anchors[`note:${mark.noteId}:${mark.id}`] = measureAnchor(compact ? { ...mark, startWord: 0 } : mark);
      const next: InkGeometry = {
        region: { w: region.offsetWidth, h: region.offsetHeight },
        rail: { leftEnd: textLeft - RAIL_GAP_REM * rem, rightStart: textRight + RAIL_GAP_REM * rem, width: region.offsetWidth, rem },
        leftLaneRight,
        rightLaneLeft,
        contentLeft,
        boxTop: (contentRect.top - regionRect.top) / s,
        stride,
        anchors,
      };
      setGeo((prev) => (sameData(prev, next) ? prev : next));
    },
    [annotations, noteMarks, layoutKey, regionRef, contentRef, flowRef, scopeRef, compact, stride],
  );
  const regionSize = geo?.region ?? NO_REGION;
  const rail = geo?.rail ?? null;

  // The current page's margin items (pane space) and every page's pens
  const { placements, noteTabs, pens } = useMemo(() => {
    const items: Placement[] = [];
    const tabs: NoteTab[] = [];
    const penList: Pen[] = [];
    if (!geo) return { placements: items, noteTabs: tabs, pens: penList };
    const { leftLaneRight, rightLaneLeft, boxTop } = geo;
    const regionW = geo.region.w;
    const toRegionX = geo.contentLeft - page * geo.stride;
    const edgeOf = (seg: Seg) => (seg.side === "left" ? seg.edgeL : seg.edgeR);
    /** The current page's segments (one per column), in pane (region) coordinates. */
    const onPage = (segs: Seg[]) =>
      segs
        .filter((g) => g.page === page)
        .map((seg) => ({
          col: seg.col,
          copy: seg !== segs[0],
          box: { ...seg.box, x: seg.box.x + toRegionX, y: seg.box.y + boxTop },
          edge: edgeOf(seg) + toRegionX,
          lines: seg.lines,
          side: seg.side,
          colSide: seg.colSide,
          firstLineY: seg.firstLineY + boxTop,
        }));

    for (const annotation of annotations) {
      const segs = geo.anchors[annotation.id] ?? [];
      for (const g of segs)
        penList.push({ key: `${annotation.id}:${g.col}`, markId: annotation.id, isNote: false, box: g.box, lines: g.lines, runs: g.runs, edge: edgeOf(g), colSide: g.side, shape: shapeOf(annotation.mark, g.lines) });
      // A plain pen mark (no text) has no margin box
      if (!annotation.text) continue;
      for (const m of onPage(segs)) {
        // One scroll column (phones): brackets always on the left gutter
        const side = m.side;
        // Narrow pane (#51): lanes shrink — the default box narrows to the
        // room left (wrapping its text), stays on screen and clear of the
        // edge page-flip strips
        const room = side === "left" ? leftLaneRight - EDGE : regionW - EDGE - rightLaneLeft;
        const laneWidth = Math.min(LANE, Math.max(MIN_W, room));
        items.push({
          annotation,
          key: `${annotation.id}:${m.col}`,
          copy: m.copy,
          shape: shapeOf(annotation.mark, m.lines),
          edge: m.edge,
          box: m.box,
          lines: m.lines,
          colSide: side,
          laneWidth,
          laneCenter: {
            x:
              side === "left"
                ? Math.max(EDGE + laneWidth / 2, leftLaneRight - laneWidth / 2)
                : Math.min(regionW - EDGE - laneWidth / 2, rightLaneLeft + laneWidth / 2),
            y: m.box.y + m.box.h / 2,
          },
        });
      }
    }

    // Note links (#211): one bracket for every link, verse-level ones too.
    // Desktop: on its column's own side (a single column: the right), in
    // lanes; 3+ on overlapping lines fold into one group bracket. Phones:
    // the left gutter, as before
    const segKey = (markId: string, col: number) => `${markId}:${col}`;
    const noteSide = (g: Seg) => (compact ? "left" : g.colSide);
    const noteEdge = (g: Seg) => (noteSide(g) === "left" ? g.edgeL : g.edgeR);
    const marksById = new Map(noteMarks.map((m) => [`note:${m.noteId}:${m.id}`, m]));
    const pinnedMark = (markId: string) =>
      markId === spotMark || (!spotlight && !!openNote && marksById.get(markId)?.noteId === openNote);
    /** Per segment key: its lane, or the group it folded into. */
    const laneOf = new Map<string, number>();
    const groupOf = new Map<string, { key: string; ids: string[]; top: number; bottom: number; lane: number; col: number; side: "left" | "right" }>();
    const byCol = new Map<string, { span: LaneSpan; seg: Seg }[]>();
    for (const [markId] of marksById)
      for (const g of geo.anchors[markId] ?? []) {
        const k = `${g.col}:${noteSide(g)}`;
        byCol.set(k, [...(byCol.get(k) ?? []), { span: { id: segKey(markId, g.col), top: g.box.y, bottom: g.box.y + g.box.h }, seg: g }]);
      }
    if (!compact)
      for (const [k, list] of byCol) {
        const spans = list.map((x) => x.span);
        let laid = bracketLanes(spans);
        // The open note's (or spotlit) links never fold: lay out again with
        // them pinned only when one would — otherwise nothing moves
        const pinned = (id: string) => pinnedMark(id.slice(0, id.lastIndexOf(":")));
        if (laid.groups.some((gr) => gr.ids.some(pinned)))
          laid = bracketLanes(spans.map((x) => ({ ...x, pinned: pinned(x.id) })));
        for (const [id, lane] of Object.entries(laid.lanes)) laneOf.set(id, lane);
        const [col, side] = k.split(":");
        for (const gr of laid.groups) {
          const group = { key: `group:${col}:${gr.ids.join(",")}`, ...gr, col: Number(col), side: side as "left" | "right" };
          for (const id of gr.ids) groupOf.set(id, group);
        }
      }
    const drawnGroups = new Set<string>();
    for (const [markId, mark] of marksById) {
      const segs = geo.anchors[markId] ?? [];
      for (const g of segs) {
        const group = groupOf.get(segKey(markId, g.col));
        if (!group) {
          penList.push({ key: segKey(markId, g.col), markId, isNote: true, page: g.page, box: g.box, lines: g.lines, runs: g.runs, edge: noteEdge(g), colSide: noteSide(g), shape: "bracket", lane: laneOf.get(segKey(markId, g.col)) ?? 0 });
          continue;
        }
        if (drawnGroups.has(group.key)) continue;
        drawnGroups.add(group.key);
        const members = group.ids.map((id) => marksById.get(id.slice(0, id.lastIndexOf(":")))!);
        const boxes = group.ids.map((id) => (geo.anchors[id.slice(0, id.lastIndexOf(":"))] ?? []).find((x) => x.col === group.col)!.box);
        const left = Math.min(...boxes.map((b) => b.x));
        const right = Math.max(...boxes.map((b) => b.x + b.w));
        penList.push({ key: group.key, markId: group.key, isNote: true, page: g.page, members, box: { x: left, y: group.top, w: right - left, h: group.bottom - group.top }, lines: 2, runs: [], edge: noteEdge(g), colSide: noteSide(g), shape: "bracket", lane: group.lane });
      }
      // The label: on the mark's first segment on this page — its own, or
      // its group's (once per group)
      const first = segs.find((g) => g.page === page);
      if (!first) continue;
      const side = noteSide(first);
      const group = groupOf.get(segKey(markId, first.col));
      if (group && tabs.some((x) => x.id === group.key)) continue;
      const lead = group
        ? (geo.anchors[group.ids[0].slice(0, group.ids[0].lastIndexOf(":"))] ?? []).find((x) => x.col === group.col)!
        : first;
      const box = group ? { ...first.box, y: group.top, h: group.bottom - group.top } : first.box;
      const leadY = group ? Math.min(...group.ids.map((id) => (geo.anchors[id.slice(0, id.lastIndexOf(":"))] ?? []).find((x) => x.col === group.col)!.firstLineY)) : first.firstLineY;
      tabs.push({
        id: group ? group.key : mark.id,
        marks: group ? group.ids.map((id) => marksById.get(id.slice(0, id.lastIndexOf(":")))!) : [mark],
        group: !!group,
        colSide: side,
        firstLineY: leadY + boxTop,
        lineH: lead.lineH,
        hook: {
          x: spineX(box, side, noteEdge(first), group ? group.lane : (laneOf.get(segKey(markId, first.col)) ?? 0)) + toRegionX,
          y: box.y + 2 + boxTop,
        },
      });
    }
    return { placements: items, noteTabs: tabs, pens: penList };
  }, [geo, annotations, noteMarks, page, compact, spotMark, spotlight, openNote]);
  // Spotlight: the reader's own boxes stay (outside its verses they step
  // back), of the note labels only the spotlit reference's
  const shownPlacements = placements;
  const markKey = (m: NoteMark) => `note:${m.noteId}:${m.id}`;
  const shownTabs = spotlight ? noteTabs.filter((m) => !m.group && spotMark === markKey(m.marks[0])) : noteTabs;
  const annotationById = new Map(annotations.map((a) => [a.id, a]));
  /** A mark that steps back while the spotlight is on. */
  const receded = (markId: string, isNote: boolean) => {
    if (!spotlight || markId === spotMark) return false;
    if (isNote) return true;
    const a = annotationById.get(markId);
    return !a || !touchesSpot(spot, a);
  };
  /** A note link's step on the ladder (#211): rest → open → spotlit; or,
   * while another note is open, stepped back by colour. */
  const hoverMark = spotlight ? null : (hover?.markId ?? null);
  const stateOf = (marks: NoteMark[]): "rest" | "open" | "lit" | "hover" | "back" => {
    if (spotlight) return marks.some((m) => markKey(m) === spotMark) ? "lit" : "rest";
    if (hoverMark && marks.some((m) => markKey(m) === hoverMark)) return "hover";
    if (!openNote) return "rest";
    return marks.some((m) => m.noteId === openNote) ? "open" : "back";
  };

  /** The open note's bracket or label, under the pointer or focused: its
   * chips and row answer (#213) — only the open note's, so the margin
   * never flickers the panel for others. */
  const hoverOf = (m: NoteMark | null) =>
    m && onHoverMark && m.noteId === openNoteId
      ? {
          onPointerEnter: () => onHoverMark(markKey(m)),
          onPointerLeave: () => onHoverMark(null),
          onFocus: () => onHoverMark(markKey(m)),
          onBlur: () => onHoverMark(null),
        }
      : {};

  // Note labels in the margin rail (#63): level with their bracket's first
  // line, stacked clear of each other and of default-placed annotation boxes.
  // Never under the tool rail: the left edge keeps its gutter clear (#211)
  const chips =
    railChips && rail
      ? placeRailChips(
          shownTabs.map((m) => ({
            id: m.id,
            side: m.colSide,
            centerY: m.firstLineY,
          })),
          {
            leftEnd: rail.leftEnd,
            rightStart: rail.rightStart,
            regionWidth: rail.width,
            edge: EDGE,
            leftEdge: Math.max(EDGE, GUTTER * rail.rem),
            chipH: CHIP_H_REM * rail.rem,
            gap: CHIP_GAP_REM * rail.rem,
            maxWidth: CHIP_MAX_REM * rail.rem,
            obstacles: marginBoxes
              ? shownPlacements
                  .filter((p) => p.annotation.offsetX == null)
                  .map((p) => {
                    const h = boxHeights.current.get(p.key) ?? 22;
                    return { side: p.colSide, top: p.laneCenter.y - h / 2, bottom: p.laneCenter.y + h / 2 };
                  })
              : [],
          },
        )
      : null;
  const chipById = new Map(chips?.map((c) => [c.id, c]) ?? []);
  const shownPens = noteInkHidden ? pens.filter((p) => !p.isNote) : pens;
  const marksByKey = new Map(noteMarks.map((m) => [markKey(m), m]));
  const chipH = CHIP_H_REM * (rail?.rem ?? 16);
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
              const active = p.markId === activeAnnotationId;
              const mark = p.isNote ? marksByKey.get(p.markId) : undefined;
              const state = p.isNote ? stateOf(p.members ?? (mark ? [mark] : [])) : "rest";
              return (
                <path
                  key={p.key}
                  d={penPath(p.shape, p.box, p.lines, p.runs, p.colSide, p.edge, p.markId.split(":").at(-1) ?? p.markId, p.lane, compact && p.isNote ? GUTTER_GAP : BRACKET_GAP)}
                  fill="none"
                  // Another note open: this one steps back by colour (#211)
                  stroke={state === "back" ? "var(--muted-foreground)" : NOTE_INK}
                  strokeWidth={state === "lit" || state === "hover" ? 2.4 : state === "open" || active ? 2.2 : compact && p.isNote ? 1.5 : 1.7}
                  strokeOpacity={receded(p.markId, p.isNote) ? SPOT_FADE : undefined}
                  data-spot-dim={receded(p.markId, p.isNote) || undefined}
                  data-note-bracket={p.isNote ? (p.members ? "group" : state) : undefined}
                  data-lane={p.isNote ? p.lane : undefined}
                  strokeLinecap="round"
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
        {/* Connectors (#211 C2): a typeset elbow from a bracket's top hook to
            its label — at rest only where stacking pushed the label off its
            line; always for the open note's links, the spotlit one's alone */}
        {shownTabs.map((m) => {
          const chip = chipById.get(m.id);
          if (!chip) return null;
          const state = stateOf(m.marks);
          const y = chip.y + chipH / 2;
          const strong = state === "open" || state === "lit" || state === "hover";
          if (!strong && !needsConnector(m.hook.y, y, m.lineH)) return null;
          const x = chip.side === "left" ? chip.x + chip.width : chip.x;
          return (
            <path
              key={`connector:${m.id}`}
              data-connector={state}
              d={connectorPath(m.hook, { x, y })}
              fill="none"
              stroke={state === "back" ? "var(--muted-foreground)" : NOTE_INK}
              strokeOpacity={strong ? 1 : 0.4}
              strokeWidth={strong ? 1.25 : 1}
              strokeLinejoin="round"
            />
          );
        })}
        {marginBoxes &&
          shownPlacements.map((p) => {
            const g = geom(p, drag, resize, boxHeights.current.get(p.key));
            if (!g.showArrow) return null;
            const active = p.annotation.id === activeAnnotationId;
            return (
              <path
                key={p.key}
                d={leaderPath(g.departX, g.departY, g.anchorX, g.anchorY, p.annotation.id, g.approach)}
                fill="none"
                stroke={NOTE_INK}
                strokeOpacity={receded(p.annotation.id, false) ? SPOT_FADE : undefined}
                data-spot-dim={receded(p.annotation.id, false) || undefined}
                strokeWidth={active ? 2 : 1.6}
                strokeLinecap="round"
              />
            );
          })}
      </svg>

      <div className={cn("pointer-events-none absolute inset-0 z-10", fade, marginHidden && "[&_*]:pointer-events-none!")}>
        {/* Note links: a typeset chip (index-tab, NOT handwriting) in the
            margin rail level with the mark's first line — never on the
            running text (#63) */}
        {/* Bracket hit strips (#211 click map): 12px, invisible, over the
            spine — open the note at this link (a group: its list); the
            eraser says where to remove it. Pointer only: the label is the
            keyboard way to the same note */}
        {railChips &&
          geo &&
          shownPens.map((p) => {
            if (!p.isNote || p.page !== page) return null;
            const marks = p.members ?? [marksByKey.get(p.markId)].filter((m): m is NoteMark => !!m);
            if (marks.length === 0 || (spotlight && !marks.some((m) => markKey(m) === spotMark))) return null;
            const x = spineX(p.box, p.colSide, p.edge, p.lane) + geo.contentLeft - page * geo.stride;
            const lead = marks[0];
            return (
              <div
                key={`strip:${p.key}`}
                aria-hidden
                data-bracket-strip=""
                className="pointer-events-auto absolute w-3 cursor-pointer"
                style={{ left: x - 6, top: p.box.y + geo.boxTop, height: p.box.h }}
                {...hoverOf(p.members ? null : lead)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (eraser) {
                    const notes = [...new Map(marks.map((m) => [m.noteId, { noteId: m.noteId, title: m.title }])).values()];
                    linkedHint(t, notes, { verse: lead.startVerse, word: lead.startWord }, onOpenNote);
                  } else if (p.members)
                    document.querySelector<HTMLElement>(`[${NOTE_OPENER}="${CSS.escape(p.markId)}"]`)?.click();
                  else onOpenNote(lead.noteId, { verse: lead.startVerse, word: lead.startWord });
                }}
              />
            );
          })}
        {shownTabs.map((m) => {
          const chip = chipById.get(m.id);
          if (!chip) return null;
          const state = stateOf(m.marks);
          const labelled = chip.width >= CHIP_LABEL_MIN_REM * (rail?.rem ?? 16);
          const verses = {
            book: m.marks[0].book,
            chapter: m.marks[0].chapter,
            startVerse: Math.min(...m.marks.map((x) => x.startVerse)),
            endVerse: Math.max(...m.marks.map((x) => x.endVerse)),
          };
          const passage = referenceLabel(markReference(verses), nameOf, locale);
          const lead = m.marks[0];
          const title = lead.title || t("note.untitled");
          // One more distinct note than its links? A note can link twice
          const notes = [...new Map(m.marks.map((x) => [x.noteId, x])).values()];
          const text = m.group ? t("reader.notesCount", { count: notes.length }) : title;
          const filled = state === "open" || state === "lit" || state === "hover";
          const className = cn(
            // 44px to touch on coarse pointers (an invisible ring round it)
            "pointer-events-auto absolute flex h-6 items-center pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2.5 pointer-coarse:before:content-['']",
            chip.side === "left" ? "justify-end" : "justify-start",
            focusRing,
            "rounded-sm",
          );
          const style = { left: chip.x, top: chip.y, width: chip.width };
          // A typeset tab (#211): transparent, a 45% ink hairline; filled
          // while its note is open or it is spotlit; another note open: the
          // muted ink, still 4.5:1
          const tab = (
            <span
              className={cn(
                "flex h-6 max-w-full items-center gap-1 overflow-hidden rounded-sm border font-sans text-list leading-none whitespace-nowrap transition-colors motion-reduce:transition-none",
                !filled && "hover:bg-accent",
                labelled ? "px-1.5" : "w-6 justify-center",
              )}
              style={
                filled
                  ? { color: "var(--background)", background: NOTE_INK, borderColor: NOTE_INK }
                  : state === "back"
                    ? { color: "var(--muted-foreground)", borderColor: "var(--border)" }
                    : { color: NOTE_INK_TEXT, borderColor: "color-mix(in oklab, var(--note-ink) 45%, transparent)" }
              }
            >
              {m.group ? <Files className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
              {labelled && <span className="overflow-hidden text-ellipsis">{text}</span>}
            </span>
          );
          if (m.group)
            return (
              <DropdownMenu key={m.id}>
                <DropdownMenuTrigger
                  data-ink-box
                  data-note-label="group"
                  {...{ [NOTE_OPENER]: m.id }}
                  aria-label={t("reader.notesGroupLabel", { count: notes.length, passage })}
                  title={notes.map((x) => x.title || t("note.untitled")).join(" · ")}
                  className={className}
                  style={style}
                >
                  {tab}
                </DropdownMenuTrigger>
                <DropdownMenuContent align={chip.side === "left" ? "end" : "start"} className="w-auto max-w-72">
                  {notes.map((x) => (
                    <DropdownMenuItem
                      key={x.noteId}
                      {...{ [NOTE_OPENER]: m.id }}
                      onClick={() => onOpenNote(x.noteId, { verse: x.startVerse, word: x.startWord })}
                    >
                      <FileText className="size-4 shrink-0" style={{ color: NOTE_INK_TEXT }} />
                      <span className="truncate">{x.title || t("note.untitled")}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          return (
            <button
              key={m.id}
              type="button"
              data-ink-box
              data-note-label={state}
              {...{ [NOTE_OPENER]: lead.id }}
              aria-label={t("reader.noteLinkLabel", { title, passage })}
              aria-expanded={lead.noteId === openNoteId}
              title={title}
              {...hoverOf(lead)}
              onClick={() => onOpenNote(lead.noteId, { verse: lead.startVerse, word: lead.startWord })}
              className={className}
              style={style}
            >
              {tab}
            </button>
          );
        })}

        {marginBoxes &&
          shownPlacements.map((p) => {
            const active = p.annotation.id === activeAnnotationId;
            const isEditing = editingId === p.key;
            const g = geom(p, drag, resize, boxHeights.current.get(p.key));
            const dragging = !p.copy && drag?.id === p.annotation.id;
            return (
              <div
                key={p.key}
                ref={measureBox(p.key)}
                data-ink-box
                className={cn("pointer-events-auto absolute -translate-y-1/2", dragging && "select-none", isEditing && "z-30")}
                style={{
                  left: g.boxLeft,
                  top: g.cy,
                  width: g.w,
                  textAlign: g.side === "left" ? "right" : "left",
                }}
                onPointerEnter={() => onFocus(p.annotation.id)}
                onPointerLeave={() => !isEditing && onFocus(null)}
                onPointerDown={(e) => {
                  if (isEditing || p.copy || e.button !== 0) return;
                  dragFrom.current = { cx: g.cx, cy: g.cy, px: e.clientX, py: e.clientY };
                  didDrag.current = false;
                }}
                onPointerMove={(e) => {
                  const from = dragFrom.current;
                  if (!from) return;
                  const dx = (e.clientX - from.px) / scaleRef.current;
                  const dy = (e.clientY - from.py) / scaleRef.current;
                  if (!didDrag.current && Math.hypot(dx, dy) < 4) return;
                  // Capture only once it's a drag: capturing on press would
                  // retarget the click to this box and the editor never opens
                  if (!didDrag.current) e.currentTarget.setPointerCapture(e.pointerId);
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
                  !p.copy &&
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
                    text={p.annotation.text ?? ""}
                    mark={p.shape}
                    onMark={(mark) => onPlace(p.annotation.id, { mark })}
                    onRemoveText={() => {
                      onEdit(p.annotation.id, null);
                      setEditingId(null);
                    }}
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
                    title={p.annotation.text ?? undefined}
                    onClick={() => {
                      if (didDrag.current) {
                        didDrag.current = false;
                        return; // a drag, not a click
                      }
                      // One note, one place to edit: a continuation hands over to the
                      // original when it's on this page
                      const original = p.copy && shownPlacements.find((o) => !o.copy && o.annotation.id === p.annotation.id);
                      setEditingId(original ? original.key : p.key);
                    }}
                    className={cn(
                      "-mx-1 block w-[calc(100%+0.5rem)] rounded-sm px-1 font-serif text-list leading-snug italic transition-colors hover:bg-accent/50",
                      p.copy ? "cursor-pointer" : dragging ? "cursor-grabbing" : "cursor-grab",
                      focusRing,
                    )}
                    aria-label={p.copy ? t("reader.annotationContinued", { text: p.annotation.text }) : undefined}
                    style={{
                      // Spotlit elsewhere: steps back by colour, still 4.5:1 (#210)
                      color: receded(p.annotation.id, false)
                        ? "var(--muted-foreground)"
                        : active
                          ? NOTE_INK_TEXT_ACTIVE
                          : NOTE_INK_TEXT,
                      textAlign: "inherit",
                    }}
                  >
                    {/* Continuation of a span split across columns/pages: marked
                        as such, so it never reads as a second annotation */}
                    {p.copy && (
                      <span className="mr-1 font-sans text-meta not-italic">{t("reader.continued")}</span>
                    )}
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
