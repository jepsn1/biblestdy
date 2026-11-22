import { describe, expect, it } from "vitest";
import { keyboardInsets } from "./keyboard-fit";

describe("keyboardInsets (#261: Close stays on screen while writing)", () => {
  it("no keyboard: nothing to fit", () => {
    expect(keyboardInsets({ offsetTop: 0, height: 844 }, 844, 47)).toBeNull();
  });
  it("keyboard up, page not panned: the bottom clears the keyboard", () => {
    expect(keyboardInsets({ offsetTop: 0, height: 508 }, 844, 47)).toEqual({ top: 0, bottom: 336 });
  });
  it("keyboard up and iOS panned the page: the top comes down to the visible area too", () => {
    expect(keyboardInsets({ offsetTop: 200, height: 508 }, 844, 47)).toEqual({ top: 153, bottom: 136 });
  });
});
