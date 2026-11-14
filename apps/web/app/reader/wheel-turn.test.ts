import { describe, expect, it } from "vitest";
import { QUIET_MS, wheelTurner } from "./wheel-turn";

/** Feed events `gap` ms apart; collect the turns. */
function run(deltas: [number, number][], gap = 16, mode = 0, start = 0) {
  const feed = wheelTurner();
  return deltas
    .map(([deltaX, deltaY], i) => feed({ deltaX, deltaY, deltaMode: mode, timeStamp: start + i * gap }))
    .filter(Boolean);
}

/** A trackpad flick: a push, then inertia decaying over ~1.5s. */
function flick(sign = 1, axis: "x" | "y" = "y"): [number, number][] {
  const out: [number, number][] = [];
  for (const d of [4, 12, 30, 45, 40]) out.push(axis === "y" ? [0, sign * d] : [sign * d, 0]);
  for (let d = 38; d >= 1; d *= 0.93) out.push(axis === "y" ? [0, sign * d] : [sign * d, 0]);
  return out;
}

describe("wheelTurner", () => {
  it("one mouse notch turns one page; down = next, up = prev", () => {
    expect(run([[0, 100]])).toEqual(["next"]);
    expect(run([[0, -100]])).toEqual(["prev"]);
  });

  it("notches a pause apart each turn; a fast spin is one gesture", () => {
    expect(run([[0, 100], [0, 100], [0, 100]], QUIET_MS + 50)).toEqual(["next", "next", "next"]);
    expect(run([[0, 100], [0, 100], [0, 100], [0, 100]], 40)).toEqual(["next"]);
  });

  it("a trackpad flick with its inertia turns exactly once", () => {
    expect(run(flick())).toEqual(["next"]);
    expect(run(flick(-1))).toEqual(["prev"]);
  });

  it("horizontal swipes follow the slide: fingers left (deltaX > 0) = next", () => {
    expect(run(flick(1, "x"))).toEqual(["next"]);
    expect(run(flick(-1, "x"))).toEqual(["prev"]);
  });

  it("a new push during the inertia tail turns again", () => {
    expect(run([...flick(), ...flick()])).toEqual(["next", "next"]);
  });

  it("small jitter never turns", () => {
    expect(run([[0, 3], [0, -4], [0, 5], [2, 0], [0, -3]])).toEqual([]);
  });

  it("line-mode wheels (Firefox) count in px", () => {
    expect(run([[0, 3]], 16, 1)).toEqual(["next"]);
  });
});
