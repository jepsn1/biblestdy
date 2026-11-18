import { describe, expect, it } from "vitest";
import { collisionPadding, keyboardUp, NO_INSETS } from "./safe-area";

describe("collisionPadding (#251)", () => {
  it("keeps Base UI's 5px air where there is no inset (desktop, Android)", () => {
    expect(collisionPadding(NO_INSETS)).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
  });

  it("adds each side's inset: a landscape iPhone keeps popovers off the notch and home indicator", () => {
    expect(collisionPadding({ top: 0, right: 59, bottom: 21, left: 59 })).toEqual({ top: 5, right: 64, bottom: 26, left: 64 });
  });

  it("returns the same object for the same insets, so positioners don't re-run", () => {
    const insets = { top: 59, right: 0, bottom: 34, left: 0 };
    expect(collisionPadding(insets)).toBe(collisionPadding(insets));
  });
});

describe("keyboardUp (#251)", () => {
  it("a keyboard is hundreds of px; toolbars and rounding are not", () => {
    expect(keyboardUp(852 - 336, 852)).toBe(true);
    expect(keyboardUp(852 - 50, 852)).toBe(false);
    expect(keyboardUp(852, 852)).toBe(false);
  });
});
