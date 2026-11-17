import type { Anchor } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { EDGE_ZONE, edgeScroll, inAnchor, PILL_ABOVE, PILL_BELOW, PILL_EDGE, pillPlace } from "./held-selection";

describe("held tap-selection (#206)", () => {
  const a = { startVerse: 3, startWord: 4, endVerse: 5, endWord: 1 } as Anchor;

  it("knows the words inside the selection, ends included", () => {
    expect(inAnchor(a, { verse: 3, word: 4 })).toBe(true);
    expect(inAnchor(a, { verse: 4, word: 40 })).toBe(true);
    expect(inAnchor(a, { verse: 5, word: 1 })).toBe(true);
  });

  it("and the words outside it", () => {
    expect(inAnchor(a, { verse: 3, word: 3 })).toBe(false);
    expect(inAnchor(a, { verse: 5, word: 2 })).toBe(false);
    expect(inAnchor(a, { verse: 2, word: 9 })).toBe(false);
  });
});

describe("pill place (#206)", () => {
  const box = (left: number, top: number, w = 40, h = 24) => ({ left, right: left + w, top, bottom: top + h });
  const pill = { width: 260, height: 48 };

  it("goes under the last line, clear of the end handle, centred on the end word", () => {
    const p = pillPlace(box(100, 300), box(170, 300), pill, 390, 844);
    expect(p.top).toBe(324 + PILL_BELOW);
    expect(p.left).toBe(190 - 130);
  });

  it("is kept 16px from the screen's sides", () => {
    expect(pillPlace(box(10, 300), box(10, 300), pill, 390, 844).left).toBe(PILL_EDGE);
    expect(pillPlace(box(350, 300), box(350, 300), pill, 390, 844).left).toBe(390 - PILL_EDGE - 260);
  });

  it("flips above the first line when there is no room below (screen or drawer)", () => {
    const p = pillPlace(box(100, 300), box(170, 700), pill, 390, 760);
    expect(p.top).toBe(300 - PILL_ABOVE - 48);
  });

  it("a selection taller than the screen: at the bottom edge", () => {
    const p = pillPlace(box(100, 20), box(170, 800), pill, 390, 844);
    expect(p.top).toBe(844 - 48 - PILL_ABOVE);
  });
});

describe("edge auto-scroll while dragging a handle (#206)", () => {
  it("only within 48px of the text's edges", () => {
    expect(edgeScroll(400, 60, 844)).toBe(0);
    expect(edgeScroll(60 + EDGE_ZONE + 1, 60, 844)).toBe(0);
  });
  it("ramps 2 → 14 px a frame towards the edge, up at the top, down at the bottom", () => {
    expect(edgeScroll(60 + EDGE_ZONE - 1, 60, 844)).toBe(-2);
    expect(edgeScroll(60, 60, 844)).toBe(-14);
    expect(edgeScroll(844, 60, 844)).toBe(14);
    expect(edgeScroll(900, 60, 844)).toBe(14);
  });
});
