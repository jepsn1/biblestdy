/**
 * Pure geometry for the ink layers (#63): word rects → line runs, washes
 * clamped to their text column, the menu's anchor rect, margin-rail chip
 * slots, and the collision check that keeps every chip/box off the words.
 * Plain data in, plain data out — no DOM.
 */

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Word rects on the same line further apart than this belong to the other
 * column of a spread. */
const COLUMN_JUMP = 60;

/** Merge word rects into one run per text line (same top, same column), in
 * the order the words came (= text order). */
export function lineRuns(rects: Rect[]): Rect[] {
  const runs: Rect[] = [];
  for (const r of rects) {
    const run = runs.find(
      (q) =>
        Math.abs(q.top - r.top) < 3 &&
        r.left - q.right < COLUMN_JUMP &&
        q.left - r.right < COLUMN_JUMP,
    );
    if (run) {
      run.left = Math.min(run.left, r.left);
      run.right = Math.max(run.right, r.right);
      run.top = Math.min(run.top, r.top);
      run.bottom = Math.max(run.bottom, r.bottom);
    } else {
      runs.push({ ...r });
    }
  }
  return runs;
}

/** The CSS-column flow: column slots repeat every `colWidth + gap` from `x`. */
export type ColumnFlow = { x: number; colWidth: number; gap: number };

/** Clamp a line run to the column it sits in — a word's trailing space
 * (or sub-pixel overhang) never pushes a wash past the text column. */
export function clampToColumn(run: Rect, flow: ColumnFlow): Rect {
  const stride = flow.colWidth + flow.gap;
  // By the run's middle: a glyph may start a hair left of its column edge
  const mid = (run.left + run.right) / 2;
  const i = stride > 0 ? Math.max(0, Math.floor((mid - flow.x) / stride)) : 0;
  const colLeft = flow.x + i * stride;
  const colRight = colLeft + flow.colWidth;
  const left = Math.max(run.left, colLeft);
  return { ...run, left, right: Math.max(left, Math.min(run.right, colRight)) };
}

/** The line of `rects` that `ref` sits on, as one rect — what a menu
 * anchors to. Falls back to `ref` alone. */
export function lineOf(rects: Rect[], ref: Rect): Rect {
  const same = rects.filter((r) => Math.abs(r.top - ref.top) < 3);
  // Seeded with ref: the first run is ref's line (the other column's words
  // on the same top form their own run)
  return lineRuns([ref, ...same])[0];
}

/** A note chip that wants a slot in the margin rail. */
export type RailRequest = {
  id: string;
  side: "left" | "right";
  /** Vertical center of the mark's first line. */
  centerY: number;
};

/** Where the rail is, per side, and what already sits in it. */
export type RailGeometry = {
  /** Left rail: chips end at this x. */
  leftEnd: number;
  /** Right rail: chips start at this x. */
  rightStart: number;
  /** Outer limits of the region (chips stay inside, with `edge` margin). */
  regionWidth: number;
  edge: number;
  /** Chip height (the 24px target) and the gap between stacked chips. */
  chipH: number;
  gap: number;
  /** Widest chip (px). */
  maxWidth: number;
  /** Things already in a rail (default-placed annotation boxes). */
  obstacles: { side: "left" | "right"; top: number; bottom: number }[];
};

export type RailChip = { id: string; side: "left" | "right"; x: number; y: number; width: number };

/** Chips go in the margin rail beside their mark's first line, stacked
 * downward (text order) so they never overlap each other or the rail's
 * obstacles. Null width room (< one 24px target) → the caller falls back to
 * inline markers. */
export function placeRailChips(requests: RailRequest[], rail: RailGeometry): RailChip[] | null {
  const room = {
    left: rail.leftEnd - rail.edge,
    right: rail.regionWidth - rail.edge - rail.rightStart,
  };
  if (requests.some((r) => room[r.side] < rail.chipH)) return null;
  const out: RailChip[] = [];
  for (const side of ["left", "right"] as const) {
    const width = Math.min(rail.maxWidth, room[side]);
    const taken = rail.obstacles
      .filter((o) => o.side === side)
      .map((o) => ({ top: o.top, bottom: o.bottom }));
    const mine = requests.filter((r) => r.side === side).sort((a, b) => a.centerY - b.centerY);
    for (const r of mine) {
      let y = r.centerY - rail.chipH / 2;
      // Push below anything we'd touch; re-scan until clear (lists are tiny)
      for (let moved = true; moved; ) {
        moved = false;
        for (const t of taken) {
          if (y < t.bottom + rail.gap && y + rail.chipH + rail.gap > t.top) {
            y = t.bottom + rail.gap;
            moved = true;
          }
        }
      }
      taken.push({ top: y, bottom: y + rail.chipH });
      out.push({
        id: r.id,
        side,
        x: side === "left" ? rail.leftEnd - width : rail.rightStart,
        y,
        width,
      });
    }
  }
  return out;
}

/** True when two rects overlap by more than `slack` px each way. */
export function intersects(a: Rect, b: Rect, slack = 0.5): boolean {
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack
  );
}

/** Every (box, word) pair that overlaps — empty = annotations never cover text. */
export function collisions<B extends Rect, W extends Rect>(boxes: B[], words: W[]): [B, W][] {
  const hits: [B, W][] = [];
  for (const b of boxes) for (const w of words) if (intersects(b, w)) hits.push([b, w]);
  return hits;
}
