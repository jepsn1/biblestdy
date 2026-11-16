import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterTyping, claimTour, releaseTour, replayTours, skipAllTours, writeTour } from "./tour-memory";
import { readTour, REPLAY_TOURS, tourDue, type ReplayDetail } from "./tour-state";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("tour memory (per device)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a fresh device: both tours due", () => {
    expect(readTour("note")).toBeNull();
    expect(tourDue("note")).toBe(true);
    expect(tourDue("notes")).toBe(true);
  });

  it("typing snoozes the note tour once, then it counts as seen", () => {
    expect(afterTyping(null)).toBe("snoozed");
    expect(afterTyping("snoozed")).toBe("seen");
    writeTour("note", afterTyping(readTour("note")));
    expect(tourDue("note")).toBe(true);
    writeTour("note", afterTyping(readTour("note")));
    expect(tourDue("note")).toBe(false);
  });

  it("Spring over on either tour turns off both", () => {
    skipAllTours();
    expect(tourDue("note")).toBe(false);
    expect(tourDue("notes")).toBe(false);
  });

  it("replay forgets both and asks the screen; says whether anything could start", () => {
    skipAllTours();
    const heard = vi.fn();
    window.addEventListener(REPLAY_TOURS, heard);
    expect(replayTours()).toBe(false);
    expect(heard).toHaveBeenCalledOnce();
    expect(tourDue("note") && tourDue("notes")).toBe(true);
    // An open note takes it
    const take = (e: Event) => ((e as CustomEvent<ReplayDetail>).detail.taken = true);
    window.addEventListener(REPLAY_TOURS, take);
    expect(replayTours()).toBe(true);
    window.removeEventListener(REPLAY_TOURS, take);
    expect(replayTours()).toBe(false);
  });

  it("blocked storage never throws: the tour may just show again", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(readTour("note")).toBeNull();
    expect(() => writeTour("note", "seen")).not.toThrow();
    expect(() => skipAllTours()).not.toThrow();
    expect(tourDue("notes")).toBe(true);
  });

  it("an unknown stored value reads as not yet", () => {
    localStorage.setItem("tour.note", "maybe");
    expect(readTour("note")).toBeNull();
  });
});

describe("one tour at a time", () => {
  it("the other tour waits until the first lets go", () => {
    expect(claimTour("notes")).toBe(true);
    expect(claimTour("notes")).toBe(true);
    expect(claimTour("note")).toBe(false);
    releaseTour("note"); // not its to release
    expect(claimTour("note")).toBe(false);
    releaseTour("notes");
    expect(claimTour("note")).toBe(true);
    releaseTour("note");
  });
});
