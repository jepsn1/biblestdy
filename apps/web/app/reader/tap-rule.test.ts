import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTap, movePress, SCROLL_SETTLE_MS, startPress, TAP_MAX_MS, TAP_SLOP_PX } from "./tap-rule";

describe("tap vs scroll on the text (#195)", () => {
  const down = startPress(100, 400, 1000);

  it("a short, still press is a tap", () => {
    expect(isTap(down, 100, 400, 1080)).toBe(true);
    expect(isTap(movePress(down, 104, 403), 103, 402, 1120)).toBe(true);
  });

  it("a fingertip's wobble within the slop is still a tap", () => {
    expect(isTap(down, 100 + TAP_SLOP_PX, 400, 1100)).toBe(true);
  });

  it("a scroll that came back to where it started is no tap", () => {
    // Down 120px and back up: released on the same word, but it travelled
    const scrolled = movePress(movePress(down, 100, 520), 100, 402);
    expect(isTap(scrolled, 100, 401, 1200)).toBe(false);
  });

  it("a drag beyond the slop is no tap", () => {
    expect(isTap(down, 100, 400 - TAP_SLOP_PX - 1, 1100)).toBe(false);
    expect(isTap(down, 100 + 40, 400, 1100)).toBe(false); // a sideways swipe
  });

  it("a hold is no tap", () => {
    expect(isTap(down, 100, 400, 1000 + TAP_MAX_MS)).toBe(true);
    expect(isTap(down, 100, 400, 1000 + TAP_MAX_MS + 1)).toBe(false);
  });

  it("a touch on moving text stops the fling — no tap", () => {
    const onFling = startPress(100, 400, 1000, 1000 - 16); // scrolled a frame ago
    expect(isTap(onFling, 100, 400, 1060)).toBe(false);
    const settled = startPress(100, 400, 1000, 1000 - SCROLL_SETTLE_MS);
    expect(isTap(settled, 100, 400, 1060)).toBe(true);
  });

  it("travel only grows", () => {
    const p = movePress(movePress(down, 130, 400), 100, 400);
    expect(p.travel).toBe(30);
  });
});

/** Guard: the text's own handlers keep touch taps on `click` + the rule. */
describe("chapter text wiring (#195)", () => {
  const src = readFileSync(new URL("./chapter-text.tsx", import.meta.url), "utf8");
  const body = (name: string) => {
    const at = src.indexOf(`function ${name}(`);
    return src.slice(at, src.indexOf("\n  }\n", at));
  };

  it("pointerup acts on words for the mouse only", () => {
    const up = body("onPointerUp");
    const guard = up.indexOf('event.pointerType !== "mouse"');
    expect(guard).toBeGreaterThan(-1);
    expect(up.indexOf("onWordClick(")).toBeGreaterThan(guard);
  });

  it("touch taps come from click, through the tap rule", () => {
    expect(src).toMatch(/onClick=\{onTap\}/);
    const tap = body("onTap");
    expect(tap.indexOf("isTap(")).toBeGreaterThan(-1);
    expect(tap.indexOf("onWordClick(")).toBeGreaterThan(tap.indexOf("isTap("));
  });
});
