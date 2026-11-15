import { describe, expect, it } from "vitest";
import {
  VIEWPORT_LOCKED,
  VIEWPORT_OPEN,
  VIEWPORT_PREPAINT,
  viewportContent,
  zoomLockHandle,
} from "./viewport";

describe("viewportContent (M10)", () => {
  it("leaves zoom on for public routes (no handle, or one without the lock)", () => {
    expect(viewportContent([{}])).toBe(VIEWPORT_OPEN);
    expect(viewportContent([{ handle: undefined }, { handle: { other: 1 } }])).toBe(VIEWPORT_OPEN);
    expect(viewportContent([{ handle: { zoomLock: "yes" } }])).toBe(VIEWPORT_OPEN);
    expect(viewportContent([])).toBe(VIEWPORT_OPEN);
  });

  it("locks when any matched route opts in", () => {
    expect(viewportContent([{}, { handle: zoomLockHandle }])).toBe(VIEWPORT_LOCKED);
  });

  it("open viewport allows pinch-zoom; locked one keeps the #61 lock", () => {
    expect(VIEWPORT_OPEN).not.toMatch(/maximum-scale|user-scalable/);
    expect(VIEWPORT_LOCKED).toBe(
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
    );
  });
});

describe("native shell (M10)", () => {
  it("locks every route inside Capacitor, sign-in included", () => {
    expect(viewportContent([{}], true)).toBe(VIEWPORT_LOCKED);
  });
});

/** Runs root.tsx's inline script against a fake meta, location and window. */
function prepaint(pathname: string, native = false) {
  const meta = { content: VIEWPORT_OPEN, setAttribute: (_: string, v: string) => (meta.content = v) };
  const window = native ? { Capacitor: { isNativePlatform: () => true } } : {};
  const document = { querySelector: () => meta };
  new Function("window", "document", "location", VIEWPORT_PREPAINT)(window, document, { pathname });
  return meta.content;
}

describe("VIEWPORT_PREPAINT (M10)", () => {
  it("locks a direct load of an app route before the router runs", () => {
    for (const p of ["/read/JHN/3", "/notes", "/notes/abc"]) expect(prepaint(p)).toBe(VIEWPORT_LOCKED);
  });

  it("leaves public pages zoomable", () => {
    for (const p of ["/", "/signin", "/privacy", "/reader-guide", "/nope"]) {
      expect(prepaint(p)).toBe(VIEWPORT_OPEN);
    }
  });

  it("locks everything in the native shell", () => {
    expect(prepaint("/signin", true)).toBe(VIEWPORT_LOCKED);
  });
});
