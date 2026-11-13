import { describe, expect, it } from "vitest";
import { extendByVerse, extendByWord, stepVerse, verseSel, type VerseIndex } from "./keyboard-selection";

// John 3:1–3 shaped: 3 verses of 4, 2, 3 words
const idx: VerseIndex = { order: [1, 2, 3], words: new Map([[1, 4], [2, 2], [3, 3]]) };
const p = (verse: number, word: number) => ({ verse, word });

describe("stepVerse", () => {
  it("moves one verse and stops at the chapter ends", () => {
    expect(stepVerse(idx, 1, 1)).toBe(2);
    expect(stepVerse(idx, 3, 1)).toBe(3);
    expect(stepVerse(idx, 1, -1)).toBe(1);
  });
  it("falls back to the first verse for an unknown one", () => {
    expect(stepVerse(idx, 99, 1)).toBe(1);
  });
});

describe("extendByWord", () => {
  it("starts at the cursor verse's first word (→) or last word (←)", () => {
    expect(extendByWord(idx, null, 2, 1)).toEqual({ a: p(2, 0), b: p(2, 0) });
    expect(extendByWord(idx, null, 1, -1)).toEqual({ a: p(1, 3), b: p(1, 3) });
  });
  it("moves the free end across verse boundaries both ways", () => {
    expect(extendByWord(idx, { a: p(1, 2), b: p(1, 3) }, 1, 1)).toEqual({ a: p(1, 2), b: p(2, 0) });
    expect(extendByWord(idx, { a: p(2, 1), b: p(2, 0) }, 2, -1)).toEqual({ a: p(2, 1), b: p(1, 3) });
  });
  it("can shrink back past the fixed end (buildAnchor normalizes)", () => {
    expect(extendByWord(idx, { a: p(2, 0), b: p(2, 0) }, 2, -1)).toEqual({ a: p(2, 0), b: p(1, 3) });
  });
  it("stays put at the chapter's first and last word", () => {
    expect(extendByWord(idx, { a: p(3, 0), b: p(3, 2) }, 3, 1).b).toEqual(p(3, 2));
    expect(extendByWord(idx, { a: p(1, 2), b: p(1, 0) }, 1, -1).b).toEqual(p(1, 0));
  });
});

describe("extendByVerse", () => {
  it("starts with the whole cursor verse", () => {
    expect(extendByVerse(idx, null, 2, 1)).toEqual({ a: p(2, 0), b: p(2, 1) });
    expect(extendByVerse(idx, null, 2, -1)).toEqual({ a: p(2, 1), b: p(2, 0) });
  });
  it("jumps the free end to the next verse's end / previous verse's start", () => {
    expect(extendByVerse(idx, { a: p(1, 0), b: p(1, 3) }, 1, 1)).toEqual({ a: p(1, 0), b: p(2, 1) });
    expect(extendByVerse(idx, { a: p(3, 2), b: p(3, 0) }, 3, -1)).toEqual({ a: p(3, 2), b: p(2, 0) });
  });
});

describe("verseSel", () => {
  it("covers every word of the verse", () => {
    expect(verseSel(idx, 1)).toEqual({ a: p(1, 0), b: p(1, 3) });
  });
});
