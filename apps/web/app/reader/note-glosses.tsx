import type { Note } from "@biblestdy/shared";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE } from "./highlight-colors";
import { leaderPath, scribblePath } from "./note-scribble";

/**
 * Pen annotations, placed by note length — like a real annotated Bible:
 * - SHORT notes: interlinear gloss, tiny handwriting in the line-gap directly
 *   above the circled words (flatter circle so both fit the gap).
 * - LONG notes: a note box connected by a hand-drawn arrow into the circle.
 *   Draggable anywhere in the reader (Excalidraw-style): the arrow re-binds
 *   live while dragging, and the position — stored as an offset from the
 *   anchored words, so it travels with the verse across reflow/pagination —
 *   is saved on release.
 * Positions are measured from the DOM so it survives reflow/pagination.
 */

const GLOSS_MAX_CHARS = 36; // longer than this goes to a placed note box
const GLOSS_LIFT = 11; // px above the mark's first line box — hugs the circle
const GLOSS_PAD_Y = 2; // flatter loop under a gloss
const EDITOR_W = 220;
const LANE = 190; // px width of a note box
const GAP = 20; // px between content box and the default lane

type Box = { x: number; y: number; w: number; h: number };
type Placement = { note: Note; box: Box } & (
  | { kind: "gloss"; x: number; y: number; maxW: number }
  | { kind: "margin"; laneCenter: { x: number; y: number } }
);

/** Note-box center, width and arrow endpoints for a margin note, honoring an
 * active drag/resize, then stored placement, then the default lane. */
function marginGeom(
  p: Extract<Placement, { kind: "margin" }>,
  drag: { id: string; x: number; y: number } | null,
  resize: { id: string; cx: number; w: number } | null,
) {
  const aCX = p.box.x + p.box.w / 2;
  const aCY = p.box.y + p.box.h / 2;
  let cx: number;
  let cy: number;
  if (drag && drag.id === p.note.id) {
    ({ x: cx, y: cy } = drag);
  } else if (p.note.offsetX != null && p.note.offsetY != null) {
    cx = aCX + p.note.offsetX;
    cy = aCY + p.note.offsetY;
  } else {
    ({ x: cx, y: cy } = p.laneCenter);
  }
  let w = p.note.width ?? LANE;
  if (resize && resize.id === p.note.id) {
    cx = resize.cx;
    w = resize.w;
  }
  const side: "left" | "right" = cx < aCX ? "left" : "right";
  const above = cy < p.box.y - 12;
  return {
    cx,
    cy,
    w,
    side,
    boxLeft: cx - w / 2,
    noteEdgeX: side === "left" ? cx + w / 2 : cx - w / 2,
    anchorX: p.box.x + p.box.w * (side === "left" ? 0.3 : 0.7),
    anchorY: above ? p.box.y - 7 : p.box.y + p.box.h + 7,
    approach: (above ? "down" : "up") as "up" | "down",
  };
}

const MIN_W = 90;
const MAX_W = 600;

export function NoteGlosses({
  notes,
  regionRef,
  contentRef,
  page,
  activeNoteId,
  onFocus,
  onEdit,
  onRemove,
  onPlace,
}: {
  notes: Note[];
  regionRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  page: number;
  activeNoteId: string | null;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onPlace: (id: string, patch: { offsetX?: number; offsetY?: number; width?: number }) => void;
}) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [regionSize, setRegionSize] = useState({ w: 0, h: 0 });
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; cx: number; w: number } | null>(null);
  const dragFrom = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const resizeFrom = useRef<{ edge: "left" | "right"; px: number; startW: number; fixedX: number } | null>(null);
  const didDrag = useRef(false);

  // Cancel edit when clicking outside the open editor.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-note-editing]")) setEditing(null);
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
      const cs = getComputedStyle(content);
      const innerLeft = contentRect.left + (parseFloat(cs.paddingLeft) || 0);
      const innerRight = contentRect.right - (parseFloat(cs.paddingRight) || 0);
      // Column geometry, to stop a gloss at its column's right edge
      const colsEl = content.firstElementChild;
      const colCs = colsEl ? getComputedStyle(colsEl) : null;
      const colGap = colCs ? parseFloat(colCs.columnGap) || 0 : 0;
      const twoCol = colCs?.columnCount === "2";
      const colW = twoCol ? (innerRight - innerLeft - colGap) / 2 : innerRight - innerLeft;
      // Default lanes for never-dragged notes
      const centerX = contentRect.left + contentRect.width / 2;
      const leftLaneRight = contentRect.left - regionRect.left - GAP;
      const rightLaneLeft = contentRect.right - regionRect.left + GAP;

      const items: Placement[] = [];
      for (const note of notes) {
        const el = region.querySelector<HTMLElement>(`[data-note-anchor="${note.id}"]`);
        if (!el) continue;
        // Line fragments on the current page (clipped/translated-out are skipped)
        const rects = [...el.getClientRects()].filter(
          (r) => r.width > 0 && r.right >= contentRect.left + 1 && r.left <= contentRect.right - 1,
        );
        if (rects.length === 0) continue;
        const left = Math.min(...rects.map((r) => r.left));
        const right = Math.max(...rects.map((r) => r.right));
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        const box: Box = {
          x: left - regionRect.left,
          y: top - regionRect.top,
          w: right - left,
          h: bottom - top,
        };

        if (note.text.length <= GLOSS_MAX_CHARS) {
          const first = rects[0]; // topmost fragment — the gloss sits above it
          const firstMid = (first.left + first.right) / 2;
          const colRight =
            twoCol && firstMid > innerLeft + colW + colGap / 2 ? innerRight : innerLeft + colW;
          items.push({
            kind: "gloss",
            note,
            box,
            x: first.left - regionRect.left,
            y: first.top - regionRect.top - GLOSS_LIFT,
            maxW: Math.max(60, colRight - first.left),
          });
        } else {
          const side = (left + right) / 2 < centerX ? "left" : "right";
          items.push({
            kind: "margin",
            note,
            box,
            laneCenter: {
              x: side === "left" ? leftLaneRight - LANE / 2 : rightLaneLeft + LANE / 2,
              y: box.y + box.h / 2,
            },
          });
        }
      }
      setPlacements(items);
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
  }, [notes, page, regionRef, contentRef]);

  return (
    <>
      {/* Leader arrows render BELOW the text (negative z): the stroke dips
          under the line of words and surfaces in the word spaces. */}
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
        {placements.map((p) => {
          if (p.kind !== "margin") return null;
          const g = marginGeom(p, drag, resize);
          const active = p.note.id === activeNoteId;
          return (
            <path
              key={p.note.id}
              d={leaderPath(g.noteEdgeX, g.cy, g.anchorX, g.anchorY, p.note.id, g.approach)}
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
          {placements.map((p) => {
            const active = p.note.id === activeNoteId;
            return (
              <path
                key={p.note.id}
                d={scribblePath(
                  p.box.x,
                  p.box.y,
                  p.box.w,
                  p.box.h,
                  p.note.id,
                  p.kind === "gloss" ? GLOSS_PAD_Y : undefined,
                )}
                fill="none"
                stroke={NOTE_INK}
                strokeWidth={active ? 2 : 1.5}
                strokeLinecap="round"
                opacity={active ? 1 : 0.75}
              />
            );
          })}
        </svg>

        {placements.map((p) => {
          const active = p.note.id === activeNoteId;
          const isEditing = editing?.id === p.note.id;
          const g = p.kind === "margin" ? marginGeom(p, drag, resize) : null;
          const dragging = drag?.id === p.note.id;
          const anchor = g
            ? {
                left: g.boxLeft,
                top: g.cy,
                width: g.w,
                textAlign: g.side === "left" ? ("right" as const) : ("left" as const),
              }
            : p.kind === "gloss"
              ? { left: p.x, top: p.y, maxWidth: isEditing ? undefined : p.maxW }
              : {};
          return (
            <div
              key={p.note.id}
              className={`pointer-events-auto absolute ${p.kind === "margin" ? "-translate-y-1/2" : ""} ${
                dragging ? "select-none" : ""
              }`}
              style={anchor}
              onMouseEnter={() => onFocus(p.note.id)}
              onMouseLeave={() => !isEditing && onFocus(null)}
              onPointerDown={(e) => {
                if (p.kind !== "margin" || isEditing || e.button !== 0 || !g) return;
                dragFrom.current = { cx: g.cx, cy: g.cy, px: e.clientX, py: e.clientY };
                didDrag.current = false;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const from = dragFrom.current;
                if (p.kind !== "margin" || !from) return;
                const dx = e.clientX - from.px;
                const dy = e.clientY - from.py;
                if (!didDrag.current && Math.hypot(dx, dy) < 4) return;
                didDrag.current = true;
                setDrag({
                  id: p.note.id,
                  x: Math.min(Math.max(from.cx + dx, LANE / 2), regionSize.w - LANE / 2),
                  y: Math.min(Math.max(from.cy + dy, 12), regionSize.h - 12),
                });
              }}
              onPointerUp={() => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (p.kind !== "margin" || !from) return;
                if (didDrag.current && drag?.id === p.note.id) {
                  const aCX = p.box.x + p.box.w / 2;
                  const aCY = p.box.y + p.box.h / 2;
                  onPlace(p.note.id, { offsetX: drag.x - aCX, offsetY: drag.y - aCY });
                }
                setDrag(null);
              }}
            >
              {p.kind === "margin" && !isEditing && g && (
                <>
                  {(["left", "right"] as const).map((edge) => (
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
                          id: p.note.id,
                          w,
                          cx: from.edge === "right" ? from.fixedX + w / 2 : from.fixedX - w / 2,
                        });
                      }}
                      onPointerUp={(e) => {
                        const from = resizeFrom.current;
                        resizeFrom.current = null;
                        if (!from) return;
                        e.stopPropagation();
                        if (resize?.id === p.note.id) {
                          const aCX = p.box.x + p.box.w / 2;
                          const aCY = p.box.y + p.box.h / 2;
                          onPlace(p.note.id, {
                            width: resize.w,
                            offsetX: resize.cx - aCX,
                            offsetY: g.cy - aCY,
                          });
                        }
                        setResize(null);
                      }}
                    />
                  ))}
                </>
              )}
              {isEditing ? (
                <div
                  data-note-editing
                  className="flex flex-col gap-1 rounded border border-border bg-popover p-1.5 text-left shadow-lg"
                  style={{ width: p.kind === "gloss" ? EDITOR_W : undefined }}
                >
                  <textarea
                    autoFocus
                    value={editing.text}
                    onChange={(e) => setEditing({ id: p.note.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        onEdit(p.note.id, editing.text.trim());
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
                        onRemove(p.note.id);
                        setEditing(null);
                      }}
                    >
                      delete
                    </button>
                    <span className="text-muted-foreground">esc cancel</span>
                    <button
                      type="button"
                      className="px-1 text-primary hover:opacity-80"
                      onClick={() => {
                        const t = editing.text.trim();
                        if (t) onEdit(p.note.id, t);
                        setEditing(null);
                      }}
                    >
                      save
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  role="button"
                  tabIndex={0}
                  title={p.note.text}
                  onClick={() => {
                    if (didDrag.current) {
                      didDrag.current = false;
                      return; // a drag, not a click
                    }
                    setEditing({ id: p.note.id, text: p.note.text });
                  }}
                  className={
                    p.kind === "gloss"
                      ? "cursor-text overflow-hidden font-serif text-[0.72rem] leading-none italic text-ellipsis whitespace-nowrap"
                      : `-mx-1 rounded-sm px-1 font-serif text-[0.8rem] leading-snug italic transition-colors hover:bg-accent/50 ${
                          dragging ? "cursor-grabbing" : "cursor-grab"
                        }`
                  }
                  style={{ color: active ? NOTE_INK_TEXT_ACTIVE : NOTE_INK_TEXT }}
                >
                  {p.note.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
