import { describe, expect, it } from "vitest";
import { insertedSince, isTypingKey, nextPlace, TOUR_STEPS, type TourStep } from "./tour-steps";

const note = TOUR_STEPS.note;
const notes = TOUR_STEPS.notes;
const on = (...ids: string[]) => (s: TourStep) => ids.includes(s.id);

describe("the tours' steps", () => {
  it("note: write here → + Verse → the overview, ≤ 4 steps each", () => {
    expect(note.map((s) => s.id)).toEqual(["body", "verse", "refs"]);
    expect(notes.map((s) => s.id)).toEqual(["search", "sort", "new", "mark"]);
  });

  it("only the + Verse step moves on when a reference goes in", () => {
    expect(note.filter((s) => s.advancesOnInsert).map((s) => s.id)).toEqual(["verse"]);
  });
});

describe("nextPlace", () => {
  it("everything on screen: 1 of 3, 2 of 3, 3 of 3, then done", () => {
    const all = () => true;
    expect(nextPlace(note, 0, 0, all)).toEqual({ index: 0, n: 1, total: 3 });
    expect(nextPlace(note, 1, 1, all)).toEqual({ index: 1, n: 2, total: 3 });
    expect(nextPlace(note, 2, 2, all)).toEqual({ index: 2, n: 3, total: 3 });
    expect(nextPlace(note, 3, 3, all)).toBeNull();
  });

  it("a target off screen is skipped, and the count says so", () => {
    // Phone with a note open: no list, no way back to the Bible
    expect(nextPlace(notes, 0, 0, on("new"))).toEqual({ index: 2, n: 1, total: 1 });
    // The editor's still loading: no + Verse button
    expect(nextPlace(note, 0, 0, on("body", "refs"))).toEqual({ index: 0, n: 1, total: 2 });
    expect(nextPlace(note, 1, 1, on("body", "refs"))).toEqual({ index: 2, n: 2, total: 2 });
  });

  it("nothing on screen: nothing to show", () => {
    expect(nextPlace(note, 0, 0, () => false)).toBeNull();
  });
});

describe("insertedSince", () => {
  const verse = note[1];
  it("a new reference on the + Verse step moves it on", () => expect(insertedSince(verse, 0, 1)).toBe(true));
  it("no new one: it stays (Next moves on)", () => expect(insertedSince(verse, 2, 2)).toBe(false));
  it("a removed one isn't an insert", () => expect(insertedSince(verse, 2, 1)).toBe(false));
  it("other steps ignore inserts", () => expect(insertedSince(note[0], 0, 1)).toBe(false));
  it("no step: nothing", () => expect(insertedSince(undefined, 0, 1)).toBe(false));
});

describe("isTypingKey", () => {
  const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });
  it("letters, space, Enter, Backspace write", () => {
    for (const key of ["a", "Æ", " ", "@", "Enter", "Backspace", "Delete"]) expect(isTypingKey(k(key))).toBe(true);
  });
  it("moving, closing and shortcuts don't", () => {
    for (const key of ["Tab", "Escape", "ArrowDown", "Shift", "F6"]) expect(isTypingKey(k(key))).toBe(false);
    expect(isTypingKey(k("e", { ctrlKey: true }))).toBe(false);
    expect(isTypingKey(k("z", { metaKey: true }))).toBe(false);
  });
});
