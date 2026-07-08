import type { Note } from "@biblestdy/shared";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { NOTE_INK } from "./highlight-colors";

const LANE = 190; // px width of a margin note
const GAP = 20; // px between content box and note lane

type Placement = {
  note: Note;
  side: "left" | "right";
  boxLeft: number; // note box left, region-relative
  lineY: number; // y of the flat leader line = the underline's bottom edge
  anchorX: number; // where the leader line meets the underline (its outer end)
  noteEdgeX: number; // where the leader line meets the note
};

/**
 * Always-visible ink margin notes. Each note is placed in the outer margin on
 * the side of its anchored text, with a leader line into the underlined words.
 * Positions are measured from the DOM so it survives reflow/pagination.
 */
export function MarginNotes({
  notes,
  regionRef,
  contentRef,
  page,
  activeNoteId,
  onFocus,
  onEdit,
  onRemove,
}: {
  notes: Note[];
  regionRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  page: number;
  activeNoteId: string | null;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

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
      const centerX = contentRect.left + contentRect.width / 2;
      const leftLaneRight = contentRect.left - regionRect.left - GAP;
      const rightLaneLeft = contentRect.right - regionRect.left + GAP;

      const items: Placement[] = [];
      for (const note of notes) {
        const el = region.querySelector<HTMLElement>(`[data-note-anchor="${note.id}"]`);
        if (!el) continue;
        // When the underline wraps, connect to the LAST line fragment, not the
        // bounding box (whose corner sits on the first line).
        const rects = el.getClientRects();
        const r = rects[rects.length - 1];
        if (!r || r.width === 0) continue;
        // Skip anchors not on the current page (clipped/translated out of the box).
        if (r.right < contentRect.left + 1 || r.left > contentRect.right - 1) continue;
        const side: "left" | "right" = (r.left + r.right) / 2 < centerX ? "left" : "right";
        items.push({
          note,
          side,
          boxLeft: side === "left" ? leftLaneRight - LANE : rightLaneLeft,
          // Flat line on the underline's dot row — never angled.
          lineY: r.bottom - regionRect.top - 1,
          anchorX: (side === "left" ? r.left : r.right) - regionRect.left,
          noteEdgeX: side === "left" ? leftLaneRight : rightLaneLeft,
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
    <div className="pointer-events-none absolute inset-0 z-10">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {placements.map((p) => (
          <line
            key={p.note.id}
            x1={p.noteEdgeX}
            y1={p.lineY}
            x2={p.anchorX}
            y2={p.lineY}
            stroke={NOTE_INK}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="0 5"
          />
        ))}
      </svg>

      {placements.map((p) => {
        const active = p.note.id === activeNoteId;
        const isEditing = editing?.id === p.note.id;
        return (
          <div
            key={p.note.id}
            className="pointer-events-auto absolute -translate-y-1/2"
            style={{ left: p.boxLeft, top: p.lineY, width: LANE, textAlign: p.side === "left" ? "right" : "left" }}
            onMouseEnter={() => onFocus(p.note.id)}
            onMouseLeave={() => !isEditing && onFocus(null)}
          >
            {isEditing ? (
              <div data-note-editing className="flex flex-col gap-1 text-left">
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
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] text-muted-foreground">esc cancel</span>
                  <button
                    type="button"
                    onClick={() => {
                      const t = editing.text.trim();
                      if (t) onEdit(p.note.id, t);
                      setEditing(null);
                    }}
                    className="font-mono text-[0.6rem] text-primary hover:opacity-80"
                  >
                    save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p
                  role="button"
                  tabIndex={0}
                  title="Click to edit"
                  onClick={() => setEditing({ id: p.note.id, text: p.note.text })}
                  className={`-mx-1 cursor-text rounded-sm px-1 font-serif text-[0.8rem] leading-snug italic transition-colors hover:bg-primary/10 ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {p.note.text}
                </p>
                {active && (
                  <div
                    className={`absolute top-full right-0 left-0 mt-0.5 flex font-mono text-[0.6rem] ${
                      p.side === "left" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      className="px-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(p.note.id)}
                    >
                      delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
