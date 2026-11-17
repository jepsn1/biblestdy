import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScriptureRef } from "@biblestdy/shared";
import { readHref } from "../notes/verse-resolver";
import type { NoteMark } from "./note-marks";
import {
  endsSpotlight,
  noteMarkId,
  refSpot,
  refSpotId,
  resolveSpot,
  spotFromParam,
  spotNoteId,
  spotParam,
} from "./spotlight";

const passage = { translationId: "WEB", book: "JHN", chapter: 3 };
const chapter = {
  book: "JHN",
  chapter: 3,
  verses: [14, 15, 16, 17].map((verse) => ({ verse, text: "w ".repeat(8).trim() })),
};
const mark = (over: Partial<NoteMark>): NoteMark => ({
  ...passage,
  id: "a1",
  noteId: "n",
  title: "T",
  startVerse: 14,
  startWord: 3,
  endVerse: 15,
  endWord: 2,
  ...over,
});
/** Canonical = local here (WEB). */
const same = (r: ScriptureRef) => r;

describe("resolveSpot (#210: one spotlight for every path)", () => {
  it("a selection lights its whole verses and lands on its first word", () => {
    const m = mark({});
    expect(resolveSpot(noteMarkId(m), [m], chapter, same)).toEqual({ noteId: "n", markId: "note:n:a1", start: 14, end: 15, word: 3 });
  });

  it("a text reference resolves by its canonical href, whatever its row id", () => {
    // The ref's verse-level mark: its id is the note_ref row's, rebuilt on save
    const placed = mark({ id: "ref-row-9", startVerse: 16, startWord: 0, endVerse: 16, endWord: 7, verseLevel: true });
    const spot = refSpotId("n", "bible:JHN.3.16");
    expect(resolveSpot(spot, [placed], chapter, same)).toEqual({ noteId: "n", markId: "note:n:ref-row-9", start: 16, end: 16, word: 0 });
    // After a save the row id changed: still the same spotlight
    const saved = { ...placed, id: "ref-row-10" };
    expect(resolveSpot(spot, [saved], chapter, same)?.markId).toBe("note:n:ref-row-10");
  });

  it("a text reference whose verse the note's selection already marks takes that mark", () => {
    const m = mark({ startVerse: 16, endVerse: 16 });
    expect(resolveSpot(refSpotId("n", "bible:JHN.3.16"), [m], chapter, same)?.markId).toBe("note:n:a1");
  });

  it("goes through the versification map, and waits for it", () => {
    const spot = refSpotId("n", "bible:JHN.3.17");
    const shifted = (r: ScriptureRef) => ({ ...r, verse: (r.verse ?? 0) - 2 });
    expect(resolveSpot(spot, [], chapter, shifted)).toMatchObject({ start: 15, end: 15, markId: null });
    expect(resolveSpot(spot, [], chapter, null)).toBeNull();
  });

  it("is null for another chapter, a missing mark, or no spot", () => {
    expect(resolveSpot(refSpotId("n", "bible:ROM.8.14"), [], chapter, same)).toBeNull();
    expect(resolveSpot("note:n:gone", [], chapter, same)).toBeNull();
    expect(resolveSpot(null, [], chapter, same)).toBeNull();
  });
});

describe("spot ids in the URL", () => {
  it("?mark= takes a selection's id, or a canonical href with ?note=", () => {
    expect(spotFromParam("note:n:a1", null)).toBe("note:n:a1");
    expect(spotFromParam("bible:JHN.3.16-3.17", "n")).toBe("ref:n:bible:JHN.3.16-17");
    expect(spotFromParam("bible:JHN.3.16", null)).toBeNull();
    expect(spotFromParam("bogus", "n")).toBeNull();
  });
  it("round-trips through spotParam", () => {
    expect(spotParam("ref:n:bible:JHN.3.16")).toBe("bible:JHN.3.16");
    expect(spotParam("note:n:a1")).toBe("note:n:a1");
    expect(spotNoteId("ref:n:bible:JHN.3.16")).toBe("n");
    expect(refSpot("n", { book: "JHN", chapter: 3, verse: 16 })).toBe("ref:n:bible:JHN.3.16");
  });
  it("every path builds the same URL shape", () => {
    expect(readHref({ book: "JHN", chapter: 3, verse: 16 }, "n", "bible:JHN.3.16")).toBe("/read/JHN/3?v=16&note=n&mark=bible%3AJHN.3.16");
    // No note: a plain go-to-verse, no spotlight
    expect(readHref({ book: "JHN", chapter: 3, verse: 16 }, undefined, "bible:JHN.3.16")).toBe("/read/JHN/3?v=16");
  });
});

describe("spotlight styling", () => {
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

  it("keys full ink on the word itself, never on a mark's wrapper span", () => {
    expect(css).toMatch(/\[data-spotlight\] \[data-word\]\[data-spotlit\]/);
    expect(css).not.toMatch(/\[data-spotlit\]\s+\[data-word\]/);
    expect(read("./chapter-text.tsx")).not.toMatch(/data-spotlit=\{seg\./);
  });

  it("never hides the reader's own marks: they fade outside the verses", () => {
    expect(read("./highlight-marks.tsx")).not.toMatch(/hidden\s*\?\s*0/);
    const marks = read("./annotation-marks.tsx");
    expect(marks).not.toMatch(/spotlight \? \[\] : placements/);
    expect(marks).not.toMatch(/spotlight \? pens\.filter/);
  });

  it("the gold verse tint is for a plain go-to-verse only, never a note's reference", () => {
    const reader = read("./paginated-chapter.tsx");
    // ?v= tints only without ?mark; "Read here" no longer navigates to ?v
    expect(reader).toMatch(/if \(!searchParams\.has\("mark"\)\) \{\s*setFlash\(target\)/);
    expect(reader).not.toMatch(/navigate\(readHref\(ref\)\)/);
    expect(read("../routes/notes.tsx")).not.toMatch(/navigate\(readHref\(r, open\.id\)\)/);
  });

  it("the spotlight never prints, and changes at once under reduced motion", () => {
    expect(css).toMatch(/@media print \{\s*\[data-spotlight\]/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\[data-spotlight\][^}]*\{\s*transition: none/);
  });

  it("the reader looks references up by word, not by wrapper span", () => {
    expect(read("./paginated-chapter.tsx")).not.toMatch(/data-annotation-anchor/);
  });
});

describe("endsSpotlight (#190: no timer)", () => {
  const el = (keeps: boolean) => ({ closest: (s: string) => (keeps && s.includes("data-foot-end") ? {} : null) });
  const rowEl = { closest: (s: string) => (s.includes("data-spot-row") ? {} : null) };
  const doc = (open: boolean) => ({ querySelector: () => (open ? ({} as Element) : null) });
  it("any click ends it, the text included", () => {
    expect(endsSpotlight({ type: "click", target: el(false) as unknown as Element }, doc(false))).toBe(true);
    expect(endsSpotlight({ type: "click", target: null }, doc(false))).toBe(true);
  });
  it("a page turn keeps it", () => {
    expect(endsSpotlight({ type: "click", target: el(true) as unknown as Element }, doc(false))).toBe(false);
  });
  it("an overview row decides itself (toggle or replace, #210)", () => {
    expect(endsSpotlight({ type: "click", target: rowEl as unknown as Element }, doc(false))).toBe(false);
  });
  it("Escape ends it, unless a menu or dialog takes the Escape first", () => {
    expect(endsSpotlight({ type: "keydown", key: "Escape", target: null }, doc(false))).toBe(true);
    expect(endsSpotlight({ type: "keydown", key: "Escape", target: null }, doc(true))).toBe(false);
  });
  it("other keys and scrolls keep it", () => {
    expect(endsSpotlight({ type: "keydown", key: "ArrowRight", target: null }, doc(false))).toBe(false);
    expect(endsSpotlight({ type: "pointerdown", target: null }, doc(false))).toBe(false);
  });
});

describe("spotlight has no timer (#190)", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  it("no timeout clears the chip or verse tint", () => {
    expect(read("./ref-bridge.tsx")).not.toMatch(/setTimeout\([^)]*chip-flash/);
    expect(read("./paginated-chapter.tsx")).not.toContain("verse-flash");
    expect(read("../app.css")).not.toMatch(/animation: verse-flash/);
  });
});
