import { useTranslation } from "react-i18next";
import type { Annotation } from "@biblestdy/shared";
import { FileText } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE } from "./highlight-colors";
import type { NoteMark } from "./use-notes";
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
const ARROW_MIN_DIST = 40; // box closer than this to the circle: no arrow

const BRACKET_GAP = 10; // bracket spine sits this far left of the span's lines

type Box = { x: number; y: number; w: number; h: number };
/** lines: distinct text lines the span covers — 1 = circle it, 2+ = bracket */
type Placement = {
  annotation: Annotation;
  box: Box;
  lines: number;
  colSide: "left" | "right"; // which column of the spread the span sits in
  laneCenter: { x: number; y: number };
};
/** A note anchor's mark: same circle/bracket by geometry, plus a static chip
 * beside it that opens the document panel. One tab per anchor — a multi-anchor
 * note draws a mark at each of its spans in this chapter. */
type NoteTab = { mark: NoteMark; box: Box; lines: number; colSide: "left" | "right" };

/** Box center, width and arrow endpoints, honoring an active drag/resize,
 * then stored placement, then the default lane. */
function geom(
  p: Placement,
  drag: { id: string; x: number; y: number } | null,
  resize: { id: string; cx: number; w: number } | null,
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
  let w = p.annotation.width ?? LANE;
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
  return {
    cx,
    cy,
    w,
    side,
    boxLeft: cx - w / 2,
    noteEdgeX,
    anchorX,
    anchorY,
    approach: (above ? "down" : "up") as "up" | "down",
    // A box parked beside its circle needs no arrow — that's the gloss look
    showArrow: Math.hypot(noteEdgeX - anchorX, cy - anchorY) > ARROW_MIN_DIST,
  };
}

export function AnnotationMarks({
  annotations,
  noteMarks,
  regionRef,
  contentRef,
  page,
  activeAnnotationId,
  selectedMarkId,
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
  page: number;
  activeAnnotationId: string | null;
  /** Mark of the reference selected in the note panel — while set, every
   * other mark's ink is hidden so this one owns the page. */
  selectedMarkId: string | null;
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
  const { t } = useTranslation();
  const [noteTabs, setNoteTabs] = useState<NoteTab[]>([]);
  // Spotlight: only the selected reference's mark is drawn
  const shownPlacements = spotlight ? [] : placements;
  const shownTabs = spotlight
    ? noteTabs.filter((m) => selectedMarkId === `note:${m.mark.noteId}:${m.mark.id}`)
    : noteTabs;
  const [regionSize, setRegionSize] = useState({ w: 0, h: 0 });
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; cx: number; w: number } | null>(null);
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
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-annotation-editing]")) setEditing(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [editing]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    const content = contentRef.current;
    if (!region || !content) return;

    const measure = () => {
      const regionRect = region.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      setRegionSize({ w: regionRect.width, h: regionRect.height });
      const centerX = contentRect.left + contentRect.width / 2;
      const leftLaneRight = contentRect.left - regionRect.left - GAP;
      const rightLaneLeft = contentRect.right - regionRect.left + GAP;

      /** Box + line count of an anchor's words on the current page, measured
       * straight from the [data-verse][data-word] spans — independent of any
       * wrapper, so overlapping/nested marks all measure correctly. Null if
       * fully off-page (clipped/translated-out words are skipped). */
      const measureAnchor = (a: {
        startVerse: number;
        startWord: number;
        endVerse: number;
        endWord: number;
      }) => {
        const rects: DOMRect[] = [];
        for (let v = a.startVerse; v <= a.endVerse; v++) {
          const els = region.querySelectorAll<HTMLElement>(`[data-verse="${v}"][data-word]`);
          for (const el of els) {
            const w = Number(el.dataset.word);
            if (v === a.startVerse && w < a.startWord) continue;
            if (v === a.endVerse && w > a.endWord) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.right < contentRect.left + 1 || r.left > contentRect.right - 1) continue;
            rects.push(r);
          }
        }
        if (rects.length === 0) return null;
        const left = Math.min(...rects.map((r) => r.left));
        const right = Math.max(...rects.map((r) => r.right));
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        // Distinct (line, column) clusters — same top in the other column of
        // the spread is a different line
        const runs: { top: number; left: number; right: number }[] = [];
        for (const r of rects) {
          const run = runs.find(
            (q) => Math.abs(q.top - r.top) < 3 && r.left - q.right < 60 && q.left - r.right < 60,
          );
          if (run) {
            run.left = Math.min(run.left, r.left);
            run.right = Math.max(run.right, r.right);
          } else {
            runs.push({ top: r.top, left: r.left, right: r.right });
          }
        }
        return {
          box: {
            x: left - regionRect.left,
            y: top - regionRect.top,
            w: right - left,
            h: bottom - top,
          } as Box,
          lines: runs.length,
          mid: (left + right) / 2,
        };
      };

      const items: Placement[] = [];
      for (const annotation of annotations) {
        const m = measureAnchor(annotation);
        if (!m) continue;
        const side = m.mid < centerX ? "left" : "right";
        items.push({
          annotation,
          box: m.box,
          lines: m.lines,
          colSide: side,
          laneCenter: {
            x: side === "left" ? leftLaneRight - LANE / 2 : rightLaneLeft + LANE / 2,
            y: m.box.y + m.box.h / 2,
          },
        });
      }
      setPlacements(items);

      const tabs: NoteTab[] = [];
      for (const mark of noteMarks) {
        const m = measureAnchor(mark);
        if (m)
          tabs.push({
            mark,
            box: m.box,
            lines: m.lines,
            colSide: m.mid < centerX ? "left" : "right",
          });
      }
      setNoteTabs(tabs);
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
  }, [annotations, noteMarks, page, regionRef, contentRef]);

  return (
    <>
      {/* Leader arrows render BELOW the text (negative z): the stroke dips
          under the line of words and surfaces in the word spaces. The
          selected reference's wash paints here too — marker behind the text,
          never a layer over it. */}
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
        {shownPlacements.map((p) => {
          const g = geom(p, drag, resize);
          if (!g.showArrow) return null;
          const active = p.annotation.id === activeAnnotationId;
          return (
            <path
              key={p.annotation.id}
              d={leaderPath(g.noteEdgeX, g.cy, g.anchorX, g.anchorY, p.annotation.id, g.approach)}
              fill="none"
              stroke={NOTE_INK}
              strokeWidth={active ? 1.8 : 1.4}
              strokeLinecap="round"
              opacity={active ? 1 : 0.75}
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 z-10">
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {shownPlacements.map((p) => {
            const active = p.annotation.id === activeAnnotationId;
            return (
              <path
                key={p.annotation.id}
                d={
                  p.lines > 1
                    ? bracketPath(
                        p.colSide === "left"
                          ? p.box.x - BRACKET_GAP
                          : p.box.x + p.box.w + BRACKET_GAP,
                        p.box.y + 2,
                        p.box.y + p.box.h - 2,
                        p.annotation.id,
                        p.colSide === "left" ? 1 : -1,
                      )
                    : scribblePath(p.box.x, p.box.y, p.box.w, p.box.h, p.annotation.id)
                }
                fill="none"
                stroke={NOTE_INK}
                strokeWidth={active ? 2 : 1.5}
                strokeLinecap="round"
                opacity={active ? 1 : 0.75}
              />
            );
          })}
          {shownTabs.map((m) => {
            const markId = `note:${m.mark.noteId}:${m.mark.id}`;
            const active = activeAnnotationId === markId || selectedMarkId === markId;
            return (
              <path
                key={m.mark.id}
                d={
                  m.lines > 1
                    ? bracketPath(
                        m.colSide === "left"
                          ? m.box.x - BRACKET_GAP
                          : m.box.x + m.box.w + BRACKET_GAP,
                        m.box.y + 2,
                        m.box.y + m.box.h - 2,
                        m.mark.id,
                        m.colSide === "left" ? 1 : -1,
                      )
                    : scribblePath(m.box.x, m.box.y, m.box.w, m.box.h, m.mark.id)
                }
                fill="none"
                stroke={NOTE_INK}
                strokeWidth={active ? 2 : 1.5}
                strokeLinecap="round"
                opacity={active ? 1 : 0.75}
              />
            );
          })}
        </svg>

        {/* Full-annotation links: a typeset chip (index-tab, NOT handwriting) in the
            interline gap above the mark's end — distinct from inline-annotation pen
            text, and never sitting on the running text */}
        {shownTabs.map((m) => {
          return (
          <button
            key={m.mark.id}
            type="button"
            title={m.mark.title || t("note.open")}
            onClick={() => onOpenNote(m.mark.noteId)}
            className="pointer-events-auto absolute flex max-w-40 cursor-pointer items-center gap-1 overflow-hidden rounded-full border bg-popover px-1.5 py-px font-mono text-[0.58rem] leading-none whitespace-nowrap transition-colors hover:bg-accent"
            style={{
              left:
                m.lines > 1
                  ? m.colSide === "left"
                    ? m.box.x - BRACKET_GAP
                    : undefined
                  : m.box.x + m.box.w - 10,
              ...(m.lines > 1 && m.colSide === "right"
                ? { left: m.box.x + m.box.w + BRACKET_GAP, transform: "translateX(-100%)" }
                : {}),
              top: m.box.y - 18,
              color: NOTE_INK_TEXT,
              borderColor: NOTE_INK,
            }}
          >
            <FileText className="size-2.5 shrink-0" />
            <span className="overflow-hidden text-ellipsis">{m.mark.title || "note"}</span>
          </button>
          );
        })}

        {shownPlacements.map((p) => {
          const active = p.annotation.id === activeAnnotationId;
          const isEditing = editing?.id === p.annotation.id;
          const g = geom(p, drag, resize);
          const dragging = drag?.id === p.annotation.id;
          return (
            <div
              key={p.annotation.id}
              className={`pointer-events-auto absolute -translate-y-1/2 ${dragging ? "select-none" : ""}`}
              style={{
                left: g.boxLeft,
                top: g.cy,
                width: g.w,
                textAlign: g.side === "left" ? "right" : "left",
              }}
              onMouseEnter={() => onFocus(p.annotation.id)}
              onMouseLeave={() => !isEditing && onFocus(null)}
              onPointerDown={(e) => {
                if (isEditing || e.button !== 0) return;
                dragFrom.current = { cx: g.cx, cy: g.cy, px: e.clientX, py: e.clientY };
                didDrag.current = false;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const from = dragFrom.current;
                if (!from) return;
                const dx = e.clientX - from.px;
                const dy = e.clientY - from.py;
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
                      const dx = e.clientX - from.px;
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
                <div
                  data-annotation-editing
                  className="flex flex-col gap-1 rounded border border-border bg-popover p-1.5 text-left shadow-lg"
                >
                  <textarea
                    autoFocus
                    value={editing.text}
                    onChange={(e) => setEditing({ id: p.annotation.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        onEdit(p.annotation.id, editing.text.trim());
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-16 w-full resize-none rounded border border-primary/50 bg-background/80 p-1.5 font-serif text-xs outline-none"
                  />
                  <div className="flex items-center justify-between font-mono text-[0.6rem]">
                    <button
                      type="button"
                      className="px-1 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        onRemove(p.annotation.id);
                        setEditing(null);
                      }}
                    >
                      {t("note.delete")}
                    </button>
                    <span className="text-muted-foreground">{t("note.escCancel")}</span>
                    <button
                      type="button"
                      className="px-1 text-primary hover:opacity-80"
                      onClick={() => {
                        const trimmed = editing.text.trim();
                        if (trimmed) onEdit(p.annotation.id, trimmed);
                        setEditing(null);
                      }}
                    >
                      {t("note.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  role="button"
                  tabIndex={0}
                  title={p.annotation.text}
                  onClick={() => {
                    if (didDrag.current) {
                      didDrag.current = false;
                      return; // a drag, not a click
                    }
                    setEditing({ id: p.annotation.id, text: p.annotation.text });
                  }}
                  className={`-mx-1 rounded-sm px-1 font-serif text-[0.8rem] leading-snug italic transition-colors hover:bg-accent/50 ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ color: active ? NOTE_INK_TEXT_ACTIVE : NOTE_INK_TEXT }}
                >
                  {p.annotation.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
