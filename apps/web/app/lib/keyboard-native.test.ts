import { describe, expect, it } from "vitest";
import { keyboardInsets } from "./keyboard-fit";
import { caretDelta, panFor, shellViewportHeight } from "./keyboard-native";

describe("shellViewportHeight (#273: the shell's visual viewport sees the keyboard again)", () => {
  it("keyboard down: the whole screen", () => {
    expect(shellViewportHeight(844, 844, 0)).toBe(844);
  });
  it("keyboard up, WKWebView unaware of it: layout minus the plugin's height", () => {
    expect(shellViewportHeight(844, 844, 336)).toBe(508);
  });
  it("a web view that shrinks it as well is never counted twice", () => {
    expect(shellViewportHeight(508, 844, 336)).toBe(508);
  });
  it("feeds the sheet fitting (#261) exactly as Safari would", () => {
    expect(keyboardInsets({ offsetTop: 0, height: shellViewportHeight(844, 844, 336) }, 844, 47)).toEqual({ top: 0, bottom: 336 });
  });
  it("a hardware keyboard's slim bar is no keyboard to the fitting", () => {
    expect(keyboardInsets({ offsetTop: 0, height: shellViewportHeight(844, 844, 55) }, 844, 47)).toBeNull();
  });
});

describe("caretDelta (#273: the caret never hides under the docked bar)", () => {
  const box = { top: 100, bottom: 400 };
  it("in sight: no move", () => {
    expect(caretDelta({ top: 200, bottom: 224 }, box)).toBe(0);
  });
  it("below the box (the keyboard came up over it): scrolled up into sight with air", () => {
    expect(caretDelta({ top: 450, bottom: 474 }, box)).toBe(82);
  });
  it("right at the edge counts as hidden", () => {
    expect(caretDelta({ top: 372, bottom: 396 }, box)).toBe(4);
  });
  it("above the box: scrolled down", () => {
    expect(caretDelta({ top: 60, bottom: 84 }, box)).toBe(-48);
  });
  it("a box too small for any air: leave it", () => {
    expect(caretDelta({ top: 0, bottom: 20 }, { top: 100, bottom: 110 })).toBe(0);
  });
});

describe("panFor (#273: the shell's stand-in for Safari's pan)", () => {
  it("field above the keyboard: no pan", () => {
    expect(panFor({ top: 300, bottom: 344 }, 508)).toBe(0);
  });
  it("field under the keyboard: lifted to sit just above it", () => {
    expect(panFor({ top: 600, bottom: 644 }, 508)).toBe(148);
  });
  it("never lifts the field's top off the screen", () => {
    expect(panFor({ top: 100, bottom: 700 }, 508)).toBe(88);
  });
});
