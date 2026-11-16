import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inFlowInkKey } from "./ink-geometry";
import { createMeasureScheduler } from "./measure-scheduler";

/**
 * #202: a phone's note markers sit IN the text flow. When they land after
 * the washes were measured, the words move along inside unchanged boxes —
 * no resize, so the highlight kept the old word spots (shifted by the icon).
 * The chapter keys its in-flow ink and re-runs every measurer on a change.
 */
describe("in-flow ink key (#202)", () => {
  const m = (id: string) => ({ id });
  it("changes when a marker comes or goes", () => {
    const none = inFlowInkKey([], [], null);
    const one = inFlowInkKey([[m("a")]], [], null);
    const two = inFlowInkKey([[m("a"), m("b")]], [], null);
    expect(new Set([none, one, two]).size).toBe(3);
  });
  it("changes when an inline pen line is added, rewritten or opened for editing", () => {
    const base = inFlowInkKey([], [[{ id: "p", text: "hi" }]], null);
    expect(inFlowInkKey([], [[{ id: "p", text: "hello" }]], null)).not.toBe(base);
    expect(inFlowInkKey([], [[{ id: "p", text: "hi" }]], "p")).not.toBe(base);
    expect(inFlowInkKey([], [], null)).not.toBe(base);
  });
  it("is stable for the same ink (no needless re-measure)", () => {
    expect(inFlowInkKey([[m("a")]], [[{ id: "p", text: "x" }]], null)).toBe(
      inFlowInkKey([[m("a")]], [[{ id: "p", text: "x" }]], null),
    );
  });
});

describe("reflow re-measures every watcher, pure reads first (#202)", () => {
  it("runs each job once, late last", () => {
    const s = createMeasureScheduler(() => ({ observe() {}, unobserve() {} }));
    const ran: string[] = [];
    s.watch([{} as Element], { late: true, run: (r) => ran.push(`late:${r}`) });
    s.watch([{} as Element], { run: (r) => ran.push(`wash:${r}`) });
    s.runAll("reflow");
    expect(ran).toEqual(["wash:reflow", "late:reflow"]);
  });
});

describe("chapter text wires its in-flow ink to a reflow (#202)", () => {
  const src = readFileSync(new URL("./chapter-text.tsx", import.meta.url), "utf8");
  it("keys the markers, the pen lines and the editor", () => {
    expect(src).toMatch(/useReflow\(inFlowInkKey\(markersByVerse\.values\(\), linesByVerse\.values\(\), editingId\)\)/);
  });
  it("prints in-flow ink only from those sources", () => {
    // Every in-flow box (data-ink-box) is a marker or a pen line/editor
    const boxes = src.match(/data-ink-box/g)?.length ?? 0;
    expect(boxes).toBe(2);
  });
});
