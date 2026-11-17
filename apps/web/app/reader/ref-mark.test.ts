import type { Annotation, Highlight } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { refMarkState } from "./ref-mark";

const id = "0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d";
const mark = { kind: "highlight" as const, id };
const at = { translationId: "WEB", book: "JHN", chapter: 3, startVerse: 16, startWord: 0, endVerse: 16, endWord: 3 };
const gold: Highlight = { ...at, id, color: "gold" };
const pen: Annotation = { ...at, id, text: null, mark: "circle" };

describe("refMarkState (#216)", () => {
  it("live on the page: its kind as it is now (a recolour follows)", () => {
    const s = (live: Highlight | Annotation) => refMarkState(mark, { live, onPage: true, server: undefined, readingId: "WEB" });
    expect(s(gold)).toEqual({ state: "live", kind: { type: "highlight", color: "gold" } });
    expect(s({ ...gold, color: "green" })).toEqual({ state: "live", kind: { type: "highlight", color: "green" } });
    expect(s(pen)).toEqual({ state: "live", kind: { type: "pen", mark: "circle", text: false } });
  });
  it("erased on this page: removed — whatever the server last saw", () => {
    const server = { ...mark, translationId: "WEB" };
    expect(refMarkState(mark, { live: undefined, onPage: true, server, readingId: "WEB" })).toEqual({ state: "removed" });
    expect(refMarkState(mark, { live: undefined, onPage: false, server: { ...mark, translationId: null }, readingId: "WEB" })).toEqual({
      state: "removed",
    });
  });
  it("another translation: marked in WEB", () => {
    const server = { ...mark, translationId: "WEB" };
    expect(refMarkState(mark, { live: undefined, onPage: true, server, readingId: "BPH" })).toEqual({ state: "elsewhere", translationId: "WEB" });
  });
  it("off the open page, or not saved yet: nothing claimed", () => {
    expect(refMarkState(mark, { live: undefined, onPage: false, server: { ...mark, translationId: "WEB" }, readingId: "WEB" })).toEqual({ state: "here" });
    expect(refMarkState(mark, { live: undefined, onPage: false, server: undefined, readingId: "WEB" })).toEqual({ state: "here" });
  });
});
