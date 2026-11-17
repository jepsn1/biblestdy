import type { Anchor } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { inAnchor } from "./held-selection";

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
