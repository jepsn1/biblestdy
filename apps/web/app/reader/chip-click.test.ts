import { describe, expect, it } from "vitest";
import { chipOpensOnClick, touchStayed, touchTapOpens } from "./chip-click";

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

describe("a finger lifted from a chip (#281)", () => {
  it("a short tap opens at the lift", () => {
    expect(touchTapOpens({ from: at, to: { x: 14, y: 13 }, ms: 120 })).toBe(true);
  });
  it("a scroll that began on the chip doesn't", () => {
    expect(touchTapOpens({ from: at, to: { x: 10, y: 60 }, ms: 200 })).toBe(false);
  });
  it("a long press doesn't", () => {
    expect(touchTapOpens({ from: at, to: at, ms: 800 })).toBe(false);
  });
  it("a lift without a press on the chip doesn't", () => {
    expect(touchTapOpens({ from: null, to: at, ms: 50 })).toBe(false);
  });
});

describe("a finger on a chip, held back or not (#281 panel)", () => {
  it("a tap that stops a fling doesn't open", () => {
    expect(touchTapOpens({ from: at, to: at, ms: 80, sinceScroll: 40 })).toBe(false);
  });
  it("a tap well after a scroll does", () => {
    expect(touchTapOpens({ from: at, to: at, ms: 80, sinceScroll: 2000 })).toBe(true);
  });
  it("a long press stays put: its default is held back", () => {
    expect(touchStayed(at, { x: 12, y: 11 })).toBe(true);
  });
  it("a scroll's default isn't", () => {
    expect(touchStayed(at, { x: 10, y: 80 })).toBe(false);
  });
});
