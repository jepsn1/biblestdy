/**
 * Hand-drawn ink loop around a noted span — like circling words on paper.
 * Deterministic per seed (note id) so the scribble doesn't re-wobble on
 * re-render; only re-measures move it.
 */

/** How far the loop swings beyond the text box. */
export const SCRIBBLE_PAD_X = 7;
export const SCRIBBLE_PAD_Y = 4;

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Leader stroke from a note to its circle: a hand-drawn line that runs through
 * the interline gap and hooks into the circle, ending in a small arrowhead at
 * (x2, y2). `approach` "up" comes from below the text line into the circle's
 * underside; "down" descends from above (note dragged above its verse).
 */
export function leaderPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: string,
  approach: "up" | "down" = "up",
): string {
  const rnd = mulberry32(hashSeed(seed + ":leader"));
  // Two strokes of one gesture: a long run through the interline gap, then a
  // sharp hook into the circle.
  const my =
    approach === "up"
      ? Math.max(y1, y2) + 2 + rnd() * 3 // stay inside the gap below
      : Math.min(y1, y2) - 2 - rnd() * 3; // …or the gap above
  const dir = Math.sign(x1 - x2) || 1; // which side the note is on
  const ax = x2 + dir * (10 + rnd() * 6); // corner: just before the tip, note side

  const quad = (
    p0: [number, number],
    c: [number, number],
    p1: [number, number],
    steps: number,
    jitter: number,
  ): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const cc = t * t;
      const edge = i === 0 || i === steps;
      out.push([
        a * p0[0] + b * c[0] + cc * p1[0] + (edge ? 0 : (rnd() - 0.5) * jitter),
        a * p0[1] + b * c[1] + cc * p1[1] + (edge ? 0 : (rnd() - 0.5) * jitter),
      ]);
    }
    return out;
  };

  // Under-run: note edge -> corner, sagging to the run depth
  const run = quad([x1, y1], [(x1 + x2) / 2, my + 4], [ax, my], 9, 1.6);
  // Hook: corner -> tip, turning hard; control at the corner keeps it sharp
  const hook = quad([ax, my], [x2 + dir, my], [x2, y2], 4, 0.8);
  const pts = [...run, ...hook.slice(1)];
  const steps = pts.length - 1;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const nx = (pts[i][0] + pts[i + 1][0]) / 2;
    const ny = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
  }
  d += ` L ${x2.toFixed(1)} ${y2.toFixed(1)}`;

  // Arrowhead: two short wings swept back from the tip along the end tangent
  const [px, py] = pts[steps - 1];
  const angle = Math.atan2(y2 - py, x2 - px);
  const len = 6.5 + rnd() * 2;
  for (const spread of [0.5, -0.5]) {
    const wx = x2 + Math.cos(angle + Math.PI + spread) * len;
    const wy = y2 + Math.sin(angle + Math.PI + spread) * len;
    d += ` M ${x2.toFixed(1)} ${y2.toFixed(1)} L ${wx.toFixed(1)} ${wy.toFixed(1)}`;
  }
  return d;
}

/**
 * SVG path of a wobbly pen loop around the box (x, y, w, h). The stroke
 * overshoots its start like a real circling gesture, and every radius is
 * jittered so no two loops look alike.
 */
export function scribblePath(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: string,
  padY: number = SCRIBBLE_PAD_Y,
): string {
  const rnd = mulberry32(hashSeed(seed));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + SCRIBBLE_PAD_X;
  const ry = h / 2 + padY;
  const rot = (rnd() - 0.5) * 0.05; // ~±1.4° pen tilt
  const start = Math.PI * (0.6 + rnd() * 0.3); // begin lower-left, like a real gesture
  const sweep = Math.PI * 2 + 0.3 + rnd() * 0.35; // overshoot past the start
  const steps = 18;

  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (sweep * i) / steps;
    const wobble = 1 + (rnd() - 0.5) * 0.08;
    const px = Math.cos(t) * rx * wobble;
    const py = Math.sin(t) * ry * wobble;
    pts.push([
      cx + px * Math.cos(rot) - py * Math.sin(rot) + (rnd() - 0.5) * 1.2,
      cy + px * Math.sin(rot) + py * Math.cos(rot) + (rnd() - 0.5) * 1.2,
    ]);
  }

  // Smooth through midpoints so the jitter reads as ink, not zigzag.
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d;
}
