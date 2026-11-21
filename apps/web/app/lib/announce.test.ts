import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce } from "./announce";

function fakeRegion() {
  const r = { textContent: "" as string | null, hidden: false };
  const region = { get textContent() { return r.textContent; }, set textContent(v) { r.textContent = v; }, closest: () => (r.hidden ? ({} as Element) : null) };
  return { r, get: () => region as never };
}

describe("announce (#257)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears, then says the words a beat later (same words twice are read again)", () => {
    const { r, get } = fakeRegion();
    r.textContent = "Copied";
    announce("Copied", get);
    expect(r.textContent).toBe("");
    vi.advanceTimersByTime(100);
    expect(r.textContent).toBe("Copied");
  });

  it("waits while a modal hides the region, then speaks", () => {
    const { r, get } = fakeRegion();
    r.hidden = true;
    announce("Theme: Dark", get);
    vi.advanceTimersByTime(500);
    expect(r.textContent).toBe("");
    r.hidden = false;
    vi.advanceTimersByTime(100);
    expect(r.textContent).toBe("Theme: Dark");
  });

  it("the latest message wins", () => {
    const { r, get } = fakeRegion();
    announce("Highlighted", get);
    announce("Copied John 3:16 (WEB)", get);
    vi.advanceTimersByTime(200);
    expect(r.textContent).toBe("Copied John 3:16 (WEB)");
  });

  it("is a no-op without a document", () => {
    expect(() => announce("x", undefined)).not.toThrow();
  });
});
