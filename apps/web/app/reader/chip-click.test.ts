import { describe, expect, it } from "vitest";
import { chipOpensOnClick } from "./chip-click";

const at = { x: 10, y: 10 };

describe("a click on a chip (#213 C6)", () => {
  it("a plain click opens the preview", () => {
    expect(chipOpensOnClick({ mouse: true, button: 0, from: at, to: { x: 12, y: 11 } })).toBe(true);
  });
  it("a drag that started on the chip doesn't", () => {
    expect(chipOpensOnClick({ mouse: true, button: 0, from: at, to: { x: 40, y: 10 } })).toBe(false);
  });
  it("a drag that ends on the chip (pressed elsewhere) doesn't", () => {
    expect(chipOpensOnClick({ mouse: true, button: 0, from: null, to: at })).toBe(false);
  });
  it("other buttons don't", () => {
    expect(chipOpensOnClick({ mouse: true, button: 1, from: at, to: at })).toBe(false);
  });
  it("a tap always does", () => {
    expect(chipOpensOnClick({ mouse: false, button: 0, from: null, to: at })).toBe(true);
  });
});
