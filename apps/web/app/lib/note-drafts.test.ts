import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  clearAllDrafts,
  clearDraft,
  draftDecision,
  pruneDrafts,
  readDraft,
  setDraftUser,
  shouldKeepDraft,
  writeDraft,
} from "./note-drafts";

const note = { title: "T", body: "Start.", updatedAt: "2026-11-15T00:00:00.000Z" };
const draft = (over: Partial<{ title: string; body: string; base: string }> = {}) => ({
  title: "T",
  body: "Start. More typed.",
  base: note.updatedAt,
  at: 1,
  ...over,
});

describe("draftDecision (reopening a note with unsaved text)", () => {
  it("nothing kept: nothing to do", () => expect(draftDecision(note, null)).toBe("none"));

  it("a draft saying what the note says is stale, not a change", () =>
    expect(draftDecision(note, draft({ body: "Start." }))).toBe("none"));

  it("written on this version: restore it (autosave sends it)", () =>
    expect(draftDecision(note, draft())).toBe("restore"));

  it("the note changed since (another device): offer, never overwrite", () =>
    expect(draftDecision(note, draft({ base: "2026-11-15T01:00:00.000Z" }))).toBe("offer"));
});

describe("shouldKeepDraft (owner guard)", () => {
  const b = { id: "B", title: "Beta", body: "Beta body." };

  it("never keeps the previous note's text as this one's (switching A -> B)", () =>
    expect(shouldKeepDraft("A", b, { title: "Alpha", body: "Alpha body." })).toBe(false));

  it("keeps this note's own edits", () =>
    expect(shouldKeepDraft("B", b, { title: "Beta", body: "Beta body. More." })).toBe(true));

  it("nothing edited: nothing to keep", () =>
    expect(shouldKeepDraft("B", b, { title: "Beta", body: "Beta body." })).toBe(false));
});

describe("draft storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setDraftUser(null);
  });

  /** A localStorage whose Object.keys() lists the stored keys, like the real one. */
  function stubStorage() {
    const store: Record<string, string> = {};
    Object.defineProperties(store, {
      getItem: { value: (k: string) => (Object.hasOwn(store, k) ? store[k] : null) },
      setItem: { value: (k: string, v: string) => void (store[k] = v) },
      removeItem: { value: (k: string) => void delete store[k] },
    });
    vi.stubGlobal("localStorage", store);
    return store;
  }

  it("round-trips, clears one, and clears all on sign-out", () => {
    const store = stubStorage();
    setDraftUser("u1");
    store.other = "keep";
    writeDraft("a", { title: "x", body: "y", base: "b" });
    writeDraft("b", { title: "x", body: "z", base: "b" });
    expect(readDraft("a")).toMatchObject({ title: "x", body: "y", base: "b" });
    clearDraft("a");
    expect(readDraft("a")).toBeNull();
    clearAllDrafts();
    expect(readDraft("b")).toBeNull();
    expect(store.other).toBe("keep");
  });

  it("ignores junk", () => {
    const store = stubStorage();
    setDraftUser("u1");
    store["noteDraft:u1:a"] = "{not json";
    store["noteDraft:u1:b"] = JSON.stringify({ title: 1 });
    expect(readDraft("a")).toBeNull();
    expect(readDraft("b")).toBeNull();
  });
});

describe("draft scope + pruning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setDraftUser(null);
  });

  function stubStorage() {
    const store: Record<string, string> = {};
    Object.defineProperties(store, {
      getItem: { value: (k: string) => (Object.hasOwn(store, k) ? store[k] : null) },
      setItem: { value: (k: string, v: string) => void (store[k] = v) },
      removeItem: { value: (k: string) => void delete store[k] },
    });
    vi.stubGlobal("localStorage", store);
    return store;
  }

  it("is per user: another account on the device sees none; signed out, nothing is kept", () => {
    stubStorage();
    setDraftUser("u1");
    writeDraft("n", { title: "t", body: "mine", base: "b" });
    setDraftUser("u2");
    expect(readDraft("n")).toBeNull();
    setDraftUser(null);
    writeDraft("n", { title: "t", body: "x", base: "b" });
    setDraftUser("u1");
    expect(readDraft("n")?.body).toBe("mine");
  });

  it("drops drafts of deleted notes (this user's only) and any older than 30 days", () => {
    const store = stubStorage();
    const now = 10 * DRAFT_MAX_AGE_MS;
    const at = (age: number) => JSON.stringify({ title: "t", body: "b", base: "x", at: now - age });
    store["noteDraft:u1:live"] = at(0);
    store["noteDraft:u1:gone"] = at(0);
    store["noteDraft:u1:old"] = at(DRAFT_MAX_AGE_MS + 1);
    store["noteDraft:u2:other"] = at(0);
    setDraftUser("u1");
    pruneDrafts(new Set(["live", "old"]), now);
    expect(Object.keys(store).sort()).toEqual(["noteDraft:u1:live", "noteDraft:u2:other"]);
  });
});
