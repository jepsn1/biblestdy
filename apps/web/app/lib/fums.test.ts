import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noteView, resetFums } from "./fums";

describe("FUMS view reporting", () => {
  const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetch);
    fetch.mockClear();
    resetFums();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const sent = () =>
    fetch.mock.calls.map((c) => JSON.parse(((c as unknown[])[1] as RequestInit).body as string).tokens);

  it("batches one screen's chapters into one report", () => {
    noteView("a", 0);
    noteView("b", 0);
    vi.advanceTimersByTime(400);
    expect(sent()).toEqual([["a", "b"]]);
  });

  it("counts a remount as the same view, a later return as a new one", () => {
    expect(noteView("a", 0)).toBe(true);
    expect(noteView("a", 5_000)).toBe(false);
    expect(noteView("a", 60_000)).toBe(true);
  });

  it("never sends more than 20 tokens at once", () => {
    for (let i = 0; i < 25; i++) noteView(`t${i}`, 0);
    vi.advanceTimersByTime(1000);
    expect(sent().map((b: string[]) => b.length)).toEqual([20, 5]);
  });
});
