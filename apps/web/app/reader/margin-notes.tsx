import type { Note } from "@biblestdy/shared";
import { useLayoutEffect, useState, type RefObject } from "react";

const LANE = 190; // px width of a margin note
const GAP = 20; // px between content box and note lane
const MIN_ROW = 52; // px min vertical spacing between stacked notes

type Placement = {
  note: Note;
  side: "left" | "right";
  boxLeft: number; // note box left, region-relative
  top: number; // note top, region-relative (after stacking)
  anchorX: number; // where the leader line meets the text
  anchorY: number;
  noteEdgeX: number; // where the leader line leaves the note
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
        const r = el.getBoundingClientRect();
        // Skip anchors not on the current page (clipped/translated out of the box).
        if (r.right < contentRect.left + 1 || r.left > contentRect.right - 1) continue;
        if (r.width === 0) continue;
        const side: "left" | "right" = (r.left + r.right) / 2 < centerX ? "left" : "right";
        items.push({
          note,
          side,
          boxLeft: side === "left" ? leftLaneRight - LANE : rightLaneLeft,
          top: r.top - regionRect.top,
          anchorX: (side === "left" ? r.left : r.right) - regionRect.left,
          anchorY: r.top - regionRect.top + r.height / 2,
          noteEdgeX: side === "left" ? leftLaneRight : rightLaneLeft,
        });
      }

      // Stack within each side so notes don't overlap.
      for (const side of ["left", "right"] as const) {
        let last = -Infinity;
        for (const p of items.filter((i) => i.side === side).sort((a, b) => a.top - b.top)) {
          if (p.top < last + MIN_ROW) p.top = last + MIN_ROW;
          last = p.top;
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
    <div className="pointer-events-none absolute inset-0 z-10">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {placements.map((p) => (
          <line
            key={p.note.id}
            x1={p.noteEdgeX}
            y1={p.top + 10}
            x2={p.anchorX}
            y2={p.anchorY}
            stroke="oklch(0.83 0.1 85 / 0.45)"
            strokeWidth={1}
          />
        ))}
      </svg>

      {placements.map((p) => {
        const active = p.note.id === activeNoteId;
        const isEditing = editing?.id === p.note.id;
        return (
          <div
            key={p.note.id}
            className="pointer-events-auto absolute"
            style={{ left: p.boxLeft, top: p.top, width: LANE, textAlign: p.side === "left" ? "right" : "left" }}
            onMouseEnter={() => onFocus(p.note.id)}
            onMouseLeave={() => !isEditing && onFocus(null)}
          >
            {isEditing ? (
              <div className="flex flex-col gap-1 text-left">
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
                  className="h-16 w-full resize-none rounded border border-border bg-background/60 p-1.5 font-serif text-xs outline-none focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = editing.text.trim();
                    if (t) onEdit(p.note.id, t);
                    setEditing(null);
                  }}
                  className="self-start font-mono text-[0.6rem] text-primary hover:opacity-80"
                >
                  save
                </button>
              </div>
            ) : (
              <>
                <p
                  className={`font-serif text-[0.8rem] leading-snug italic transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {p.note.text}
                </p>
                {active && (
                  <div
                    className={`mt-0.5 flex gap-2 font-mono text-[0.6rem] ${
                      p.side === "left" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary"
                      onClick={() => setEditing({ id: p.note.id, text: p.note.text })}
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
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
