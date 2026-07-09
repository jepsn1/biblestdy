import type { Note } from "@biblestdy/shared";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { NOTE_INK, NOTE_INK_TEXT, NOTE_INK_TEXT_ACTIVE } from "./highlight-colors";
import { leaderPath, SCRIBBLE_PAD_X, SCRIBBLE_PAD_Y, scribblePath } from "./note-scribble";

/**
 * Pen annotations: every note is a circled span plus a draggable, resizable
 * handwriting box (Excalidraw-style) connected by a hand-drawn arrow that
 * re-binds live. Never-dragged notes start in the outer margin lane.
 * Placement/width persist as an offset from the anchored words' center, so a
 * note travels with its verse across reflow/pagination. Park the box right
 * next to its circle and the arrow disappears — the interlinear-gloss look,
 * placed by hand.
 */

const LANE = 190; // default box width, and the margin lane it starts in
const GAP = 20; // px between content box and the default lane
const MIN_W = 90;
const MAX_W = 600;
const ARROW_MIN_DIST = 40; // box closer than this to the circle: no arrow

type Box = { x: number; y: number; w: number; h: number };
type Placement = { note: Note; box: Box; laneCenter: { x: number; y: number } };

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
  // Flip to the top approach as soon as the note rises past the circle's
  // centerline (small bias keeps untouched lane notes on the classic
  // under-run) — flipping later forces a hard bend near the arrowhead.
  const above = cy < aCY - 4;
  const noteEdgeX = side === "left" ? cx + w / 2 : cx - w / 2;
  // Land anywhere along the loop's arc, at the point facing the note, with
  // the landing height following the ellipse's curve — many touch points,
  // picked by where the note actually is.
  const rx = p.box.w / 2 + SCRIBBLE_PAD_X;
  const ry = p.box.h / 2 + SCRIBBLE_PAD_Y;
  const t = Math.min(Math.max((cx - p.box.x) / p.box.w, 0.02), 0.98);
  const ex = (t - 0.5) * p.box.w; // x-offset from the loop's center
  const bulge = ry * Math.sqrt(Math.max(0, 1 - (ex / rx) ** 2));
  const anchorX = p.box.x + p.box.w * t;
  const anchorY = above ? aCY - bulge - 5 : aCY + bulge + 5;
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

export function NoteMarks({
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
        const side = (left + right) / 2 < centerX ? "left" : "right";
        items.push({
          note,
          box,
          laneCenter: {
            x: side === "left" ? leftLaneRight - LANE / 2 : rightLaneLeft + LANE / 2,
            y: box.y + box.h / 2,
          },
        });
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
          const g = geom(p, drag, resize);
          if (!g.showArrow) return null;
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
                d={scribblePath(p.box.x, p.box.y, p.box.w, p.box.h, p.note.id)}
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
          const g = geom(p, drag, resize);
          const dragging = drag?.id === p.note.id;
          return (
            <div
              key={p.note.id}
              className={`pointer-events-auto absolute -translate-y-1/2 ${dragging ? "select-none" : ""}`}
              style={{
                left: g.boxLeft,
                top: g.cy,
                width: g.w,
                textAlign: g.side === "left" ? "right" : "left",
              }}
              onMouseEnter={() => onFocus(p.note.id)}
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
                  id: p.note.id,
                  x: Math.min(Math.max(from.cx + dx, g.w / 2), regionSize.w - g.w / 2),
                  y: Math.min(Math.max(from.cy + dy, 12), regionSize.h - 12),
                });
              }}
              onPointerUp={() => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (!from) return;
                if (didDrag.current && drag?.id === p.note.id) {
                  const aCX = p.box.x + p.box.w / 2;
                  const aCY = p.box.y + p.box.h / 2;
                  onPlace(p.note.id, { offsetX: drag.x - aCX, offsetY: drag.y - aCY });
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
              {isEditing ? (
                <div
                  data-note-editing
                  className="flex flex-col gap-1 rounded border border-border bg-popover p-1.5 text-left shadow-lg"
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
                  className={`-mx-1 rounded-sm px-1 font-serif text-[0.8rem] leading-snug italic transition-colors hover:bg-accent/50 ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
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
