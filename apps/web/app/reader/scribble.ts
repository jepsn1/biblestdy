/**
 * Hand-drawn ink loop around a noted span — like circling words on paper.
 * Deterministic per seed (note id) so the scribble doesn't re-wobble on
 * re-render; only re-measures move it.
 */

/** How far the loop swings beyond the text box. */
export const SCRIBBLE_PAD_X = 7;
export const SCRIBBLE_PAD_Y = 2.5;

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
 * A hand-drawn vertical bracket beside a multi-line span: short top foot,
 * wobbly spine from y1 to y2, short bottom foot. One pen stroke. `dir` is
 * which way the feet point: 1 = right (bracket left of the text), -1 = left.
 */
export function bracketPath(x: number, y1: number, y2: number, seed: string, dir = 1): string {
  const rnd = mulberry32(hashSeed(seed + ":bracket"));
  const foot = dir * (6 + rnd() * 3);
  const pts: [number, number][] = [[x + foot, y1 + (rnd() - 0.5) * 2]];
  pts.push([x + (rnd() - 0.5) * 1.5, y1 + (rnd() - 0.5) * 1.5]);
  const steps = Math.max(3, Math.round((y2 - y1) / 14));
  for (let i = 1; i < steps; i++)
    pts.push([x + (rnd() - 0.5) * 2.4, y1 + ((y2 - y1) * i) / steps]);
  pts.push([x + (rnd() - 0.5) * 1.5, y2 + (rnd() - 0.5) * 1.5]);
  pts.push([x + foot, y2 + (rnd() - 0.5) * 2]);

  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
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
  // One gesture, bends by the TEXT not the circle: a short straight exit from
  // the note, a bend down/up to the travel level, a level run through the
  // interline gap, then a soft tangential arrival at the circle.
  const my =
    approach === "up"
      ? Math.max(y1, y2) + 2 + rnd() * 3 // travel in the gap below
      : Math.min(y1, y2) - 2 - rnd() * 3; // …or the gap above
  const out = Math.sign(x2 - x1) || 1; // toward the circle
  const bow = approach === "up" ? 4 : -4;

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

  let pts: [number, number][];
  if (Math.abs(x2 - x1) < Math.abs(y2 - y1) && Math.abs(x2 - x1) < 60) {
    // Box parked right above/below its mark: one center-to-center drop,
    // bowing gently sideways — never a level run back over the handwriting.
    const bowX = (rnd() - 0.5) * 10 + (x2 - x1) / 2;
    pts = quad([x1, y1], [x1 + bowX, (y1 + y2) / 2], [x2, y2], 10, 1.2);
  } else if (Math.abs(x2 - x1) < 60) {
    // Short hop: a single soft curve, no room for choreography
    pts = quad([x1, y1], [(x1 + x2) / 2, my], [x2, y2], 10, 1.4);
  } else {
    // Drop nearly vertically RIGHT beside the note box — the box usually sits
    // in whitespace, so the descent avoids crossing other lines of text; only
    // the level run enters the column, riding inside one interline gap.
    const A: [number, number] = [x1 + out * (5 + rnd() * 3), y1]; // tiny exit
    const B: [number, number] = [A[0] + out * (6 + rnd() * 4), my]; // after the drop
    const exit = quad([x1, y1], [(x1 + A[0]) / 2, y1], A, 2, 0.6);
    const bend = quad(A, [A[0] + out * 2, my], B, 5, 1.2); // the drop, hugging the box
    const run = quad(B, [(B[0] + x2) / 2, my + bow], [x2, y2], 8, 1.6); // level run, soft arrival
    pts = [...exit, ...bend.slice(1), ...run.slice(1)];
  }
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

/** Corner-rounded polygon → dense polyline (each corner a small arc). */
function roundedOutline(poly: [number, number][], radius: number): [number, number][] {
  const out: [number, number][] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = poly[(i + n - 1) % n];
    const [cx, cy] = poly[i];
    const [nx, ny] = poly[(i + 1) % n];
    const lin = Math.hypot(cx - px, cy - py);
    const lout = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (r < 0.5 || lin === 0 || lout === 0) {
      out.push([cx, cy]);
      continue;
    }
    const a: [number, number] = [cx + ((px - cx) / lin) * r, cy + ((py - cy) / lin) * r];
    const b: [number, number] = [cx + ((nx - cx) / lout) * r, cy + ((ny - cy) / lout) * r];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      // Quadratic Bézier a → corner → b
      out.push([
        (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0],
        (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1],
      ]);
    }
  }
  out.push(out[0]);
  return out;
}

/** Trace a closed polyline once round plus an overshoot, by pen: jitter,
 * smoothed through midpoints. Starts a little before its first point. */
function penLoop(outline: [number, number][], rnd: () => number): string {
  const lens = [0];
  for (let i = 1; i < outline.length; i++)
    lens.push(lens[i - 1] + Math.hypot(outline[i][0] - outline[i - 1][0], outline[i][1] - outline[i - 1][1]));
  const total = lens[lens.length - 1];
  if (total === 0) return "";
  const at = (d: number): [number, number] => {
    const m = ((d % total) + total) % total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < m) i++;
    const f = (m - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return [
      outline[i - 1][0] + (outline[i][0] - outline[i - 1][0]) * f,
      outline[i - 1][1] + (outline[i][1] - outline[i - 1][1]) * f,
    ];
  };
  const start = -total * (0.04 + rnd() * 0.04);
  const sweep = total * (1.05 + rnd() * 0.05);
  const steps = Math.max(24, Math.round(sweep / 12));
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const [px, py] = at(start + (sweep * i) / steps);
    pts.push([px + (rnd() - 0.5) * 1.6, py + (rnd() - 0.5) * 1.2]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d;
}

type Run = { left: number; top: number; right: number; bottom: number };

/**
 * Hand-drawn loop around a multi-line span: a rounded rectangle (four soft
 * corners) instead of an ellipse, so a block of lines is circled without
 * the loop swelling over the neighbouring text.
 */
export function roundedScribblePath(x: number, y: number, w: number, h: number, seed: string): string {
  const rnd = mulberry32(hashSeed(seed + ":rounded"));
  const l = x - SCRIBBLE_PAD_X;
  const r = x + w + SCRIBBLE_PAD_X;
  const t = y - SCRIBBLE_PAD_Y - 1;
  const b = y + h + SCRIBBLE_PAD_Y + 1;
  // Clockwise from the bottom-left, so the pen starts low like a real gesture
  return penLoop(roundedOutline([[l, b], [l, t], [r, t], [r, b]], 12), rnd);
}

/**
 * A box that follows the words (like a text-selection outline): the first
 * line from the first marked word, full lines between, the last line to the
 * last marked word — never boxing words outside the mark. Rounded corners,
 * pen wobble. Lines that don't touch (a mark ending left of where it began
 * on the line above) get a loop each.
 */
export function contourPath(runs: Run[], seed: string): string {
  if (runs.length === 0) return "";
  const rnd = mulberry32(hashSeed(seed + ":contour"));
  const px = 3;
  const py = 1.5;
  const lines = [...runs]
    .sort((a, b) => a.top - b.top)
    .map((r) => ({ l: r.left - px, r: r.right + px, t: r.top - py, b: r.bottom + py }));
  // Chains of lines that overlap sideways share one outline
  const chains: (typeof lines)[] = [];
  for (const ln of lines) {
    const last = chains.at(-1)?.at(-1);
    if (last && ln.l < last.r - 4 && ln.r > last.l + 4) chains.at(-1)!.push(ln);
    else chains.push([ln]);
  }
  return chains
    .map((c) => {
      // Breaks between lines: halfway through the line gap
      const mid = (i: number) => (c[i].b + c[i + 1].t) / 2;
      const poly: [number, number][] = [];
      const n = c.length;
      // Left side, bottom up, then right side, top down (clockwise in screen space)
      poly.push([c[n - 1].l, c[n - 1].b]);
      for (let i = n - 1; i > 0; i--) {
        poly.push([c[i].l, mid(i - 1)]);
        poly.push([c[i - 1].l, mid(i - 1)]);
      }
      poly.push([c[0].l, c[0].t]);
      poly.push([c[0].r, c[0].t]);
      for (let i = 0; i < n - 1; i++) {
        poly.push([c[i].r, mid(i)]);
        poly.push([c[i + 1].r, mid(i)]);
      }
      poly.push([c[n - 1].r, c[n - 1].b]);
      // Drop zero-length steps (lines with the same edge)
      const clean = poly.filter((p, i) => {
        const q = poly[(i + poly.length - 1) % poly.length];
        return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5;
      });
      return penLoop(roundedOutline(clean, 7), rnd);
    })
    .join(" ");
}

/** A pen underline under each marked line: slightly wavy, a touch long. */
export function underlinePath(runs: Run[], seed: string): string {
  const rnd = mulberry32(hashSeed(seed + ":underline"));
  return runs
    .map((r) => {
      const y = r.bottom + 2 + (rnd() - 0.5);
      const x1 = r.left - 1 - rnd() * 2;
      const x2 = r.right + 1 + rnd() * 3;
      const steps = Math.max(2, Math.round((x2 - x1) / 40));
      let d = `M ${x1.toFixed(1)} ${(y + (rnd() - 0.5) * 1.2).toFixed(1)}`;
      for (let i = 1; i <= steps; i++) {
        const x = x1 + ((x2 - x1) * i) / steps;
        const cx = x - (x2 - x1) / steps / 2;
        d += ` Q ${cx.toFixed(1)} ${(y + (rnd() - 0.5) * 2).toFixed(1)} ${x.toFixed(1)} ${(y + (rnd() - 0.5) * 1.2).toFixed(1)}`;
      }
      return d;
    })
    .join(" ");
}
