import { describe, expect, it } from "vitest";
import { holePad, insertedSince, isTypingKey, nextPlace, scrimPath, textEndPoint, TOUR_STEPS, type TourStep } from "./tour-steps";

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

describe("the scrim (#192)", () => {
  it("no target: the whole viewport, no hole", () => {
    expect(scrimPath(400, 800, null)).toBe("M0 0H400V800H0Z");
  });

  it("cuts a rounded hole round the target, padded, inside the viewport", () => {
    const d = scrimPath(400, 800, { left: 10, top: 20, width: 100, height: 40 }, 6, 8);
    expect(d.startsWith("M0 0H400V800H0ZM12 14H")).toBe(true);
    expect(d).toContain("H108A8 8 0 0 1 116 22V");
    // Padding never reaches past the viewport's edge
    expect(scrimPath(400, 800, { left: 0, top: 0, width: 400, height: 50 }, 6, 8)).toMatch(/^M0 0H400V800H0ZM8 0H392A8 8 0 0 1 400 8V/);
  });

  it("a hole too small for the corners keeps them inside it", () => {
    expect(scrimPath(400, 800, { left: 10, top: 10, width: 6, height: 6 }, 0, 8)).toContain("A3 3 ");
  });

  it("a pane's hole is its edge; a control's leaves room for the ring", () => {
    expect(holePad({ inset: true })).toBe(0);
    expect(holePad({})).toBeGreaterThanOrEqual(4);
  });
});

describe("textEndPoint", () => {
  const pane = { left: 300, top: 100, width: 800, height: 500 };
  it("only the writing step points at the end of the text", () => {
    expect(TOUR_STEPS.note.filter((s) => s.atTextEnd).map((s) => s.id)).toEqual(["body"]);
  });
  it("just under the last line, at its start", () => {
    expect(textEndPoint(pane, { left: 312, top: 110, width: 400, height: 24 })).toEqual({ left: 312, top: 134, width: 24, height: 0 });
  });
  it("a long note: kept inside the pane with room for the card", () => {
    expect(textEndPoint(pane, { left: 312, top: 900, width: 400, height: 24 }).top).toBe(600 - 120);
  });
  it("no line to measure: the pane itself", () => {
    expect(textEndPoint(pane, null)).toEqual(pane);
  });
});
