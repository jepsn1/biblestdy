import { describe, expect, it } from "vitest";
import { ignoreShortcut, type ShortcutEvent } from "./shortcuts";

/** Minimal element: `closest` answers from the selectors its ancestry matches. */
function el(matches: (selector: string) => boolean, extra: { isContentEditable?: boolean } = {}) {
  return {
    closest: (selector: string) => (selector.split(",").some((s) => matches(s.trim())) ? {} : null),
    ...extra,
  };
}

const body = el(() => false);
const noModal = { querySelector: () => null };
const modalOpen = { querySelector: () => ({}) };

function key(k: string, target: unknown, mods: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: target as EventTarget,
    ...mods,
  };
}

describe("ignoreShortcut", () => {
  it("lets plain keys on the page through", () => {
    expect(ignoreShortcut(key("ArrowRight", body), noModal)).toBe(false);
    expect(ignoreShortcut(key("/", body), noModal)).toBe(false);
  });

  it("allows Shift (\"/\" is Shift+7 on Danish keyboards)", () => {
    expect(ignoreShortcut(key("/", body, { shiftKey: true } as never), noModal)).toBe(false);
  });

  it("ignores inputs and textareas", () => {
    expect(ignoreShortcut(key("ArrowLeft", el((s) => s === "input")), noModal)).toBe(true);
    expect(ignoreShortcut(key("/", el((s) => s === "textarea")), noModal)).toBe(true);
  });

  it("ignores contenteditable (MDXEditor), also nested inside it", () => {
    expect(ignoreShortcut(key("ArrowLeft", el(() => false, { isContentEditable: true })), noModal)).toBe(true);
    const inEditor = el((s) => s.startsWith("[contenteditable]"));
    expect(ignoreShortcut(key("/", inEditor), noModal)).toBe(true);
    expect(ignoreShortcut(key("ArrowRight", el((s) => s === "[role='textbox']")), noModal)).toBe(true);
  });

  it("ignores any modifier: Alt+← is browser back", () => {
    expect(ignoreShortcut(key("ArrowLeft", body, { altKey: true }), noModal)).toBe(true);
    expect(ignoreShortcut(key("ArrowRight", body, { ctrlKey: true }), noModal)).toBe(true);
    expect(ignoreShortcut(key("ArrowLeft", body, { metaKey: true }), noModal)).toBe(true);
  });

  it("ignores while a modal is open (style chooser)", () => {
    expect(ignoreShortcut(key("ArrowRight", body), modalOpen)).toBe(true);
  });

  it("ignores widgets that own the arrow keys (open select list, menus)", () => {
    expect(ignoreShortcut(key("ArrowRight", el((s) => s === "[role='listbox']")), noModal)).toBe(true);
    expect(ignoreShortcut(key("ArrowLeft", el((s) => s === "[role='menu']")), noModal)).toBe(true);
  });

  it("ignores arrows in a settings segmented control (#62: no page turn behind it)", () => {
    const seg = el((s) => s === "[data-slot='toggle-group']");
    expect(ignoreShortcut(key("ArrowRight", seg), noModal)).toBe(true);
  });

  it("ignores IME composition and already-handled events", () => {
    expect(ignoreShortcut(key("ArrowLeft", body, { isComposing: true }), noModal)).toBe(true);
    expect(ignoreShortcut(key("ArrowLeft", body, { defaultPrevented: true }), noModal)).toBe(true);
  });

  it("tolerates a non-element target (window)", () => {
    expect(ignoreShortcut(key("ArrowRight", {}), noModal)).toBe(false);
    expect(ignoreShortcut(key("ArrowRight", null), noModal)).toBe(false);
  });
});
