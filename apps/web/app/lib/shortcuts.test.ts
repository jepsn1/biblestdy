import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ignoreShortcut,
  isCharacterKey,
  isCharacterShortcut,
  liveShortcut,
  opensPalette,
  opensPlaceChooser,
  saveSingleKeys,
  singleKeyOff,
  singleKeysOn,
  type ShortcutEvent,
} from "./shortcuts";

// The switch persists to the account; no network in tests
const save = vi.hoisted(() => vi.fn<(patch: unknown) => Promise<void>>(() => Promise.resolve()));
vi.mock("./preferences", () => ({ loadPreferences: () => Promise.resolve(null), savePreferences: save }));

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

describe("opensPlaceChooser (Ctrl/⌘B)", () => {
  const input = el((s) => s === "input");
  const editor = el(() => false, { isContentEditable: true });
  const filter = el((s) => s === "input" || s === "[data-place-filter]");

  it("Ctrl+B and ⌘B on the page", () => {
    expect(opensPlaceChooser(key("b", body, { ctrlKey: true }), noModal)).toBe(true);
    expect(opensPlaceChooser(key("B", body, { metaKey: true }), noModal)).toBe(true);
  });

  it("not a plain b, nor with Alt/Shift", () => {
    expect(opensPlaceChooser(key("b", body), noModal)).toBe(false);
    expect(opensPlaceChooser(key("b", body, { ctrlKey: true, altKey: true }), noModal)).toBe(false);
    expect(opensPlaceChooser({ ...key("b", body, { ctrlKey: true }), shiftKey: true }, noModal)).toBe(false);
  });

  it("never in a field or the note editor (Ctrl+B = bold there)", () => {
    expect(opensPlaceChooser(key("b", input, { ctrlKey: true }), noModal)).toBe(false);
    expect(opensPlaceChooser(key("b", editor, { ctrlKey: true }), noModal)).toBe(false);
  });

  it("but in its own filter it toggles", () => {
    expect(opensPlaceChooser(key("b", filter, { ctrlKey: true }), noModal)).toBe(true);
  });

  it("not over another dialog, nor when already handled", () => {
    expect(opensPlaceChooser(key("b", body, { ctrlKey: true }), modalOpen)).toBe(false);
    expect(opensPlaceChooser(key("b", body, { ctrlKey: true, defaultPrevented: true }), noModal)).toBe(false);
  });
});

describe("single-key shortcuts switch (#145, WCAG 2.1.4)", () => {
  beforeEach(() => save.mockClear());
  afterEach(async () => {
    await saveSingleKeys(true);
  });

  it("a character key is one character without Ctrl/⌘/Alt — Shift included", () => {
    for (const k of ["t", "/", "?", "[", "]", "v", "H", "1", "h"]) expect(isCharacterKey(key(k, body))).toBe(true);
    for (const k of ["ArrowLeft", "PageDown", "Home", "Escape", "Enter", " ", "F6", "Unidentified"])
      expect(isCharacterKey(key(k, body))).toBe(false);
    expect(isCharacterKey(key("k", body, { ctrlKey: true }))).toBe(false);
    expect(isCharacterKey(key("/", body, { altKey: true }))).toBe(false);
  });

  it("on by default: page keys go through", () => {
    expect(singleKeysOn()).toBe(true);
    expect(singleKeyOff(key("t", body))).toBe(false);
    expect(ignoreShortcut(key("[", body), noModal)).toBe(false);
  });

  it("off: every character key is ignored, named keys still work, and it's saved", async () => {
    await saveSingleKeys(false);
    expect(save).toHaveBeenCalledWith({ singleKeyShortcuts: false });
    for (const k of ["t", "/", "?", "[", "]", "v", "H", "1", "6"]) {
      expect(singleKeyOff(key(k, body))).toBe(true);
      expect(ignoreShortcut(key(k, body), noModal)).toBe(true);
    }
    for (const k of ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Escape"])
      expect(ignoreShortcut(key(k, body), noModal)).toBe(false);
  });

  it("a failed save puts the switch back", async () => {
    save.mockRejectedValueOnce(new Error("offline"));
    await expect(saveSingleKeys(false)).rejects.toThrow("offline");
    expect(singleKeysOn()).toBe(true);
  });

  it("knows which shown keys are single-key ones", () => {
    for (const s of ["T", "t", "/", "?", "[", "Shift+H", "1", "1–6", "V"]) expect(isCharacterShortcut(s)).toBe(true);
    for (const s of ["mod+K", "mod+B", "mod+.", "Meta+K", "Control+K", "Esc", "←", "→", "ArrowLeft", "PageUp", "F6", "Shift+←"])
      expect(isCharacterShortcut(s)).toBe(false);
  });

  it("hints and aria-keyshortcuts drop dead keys while off (none left = nothing)", () => {
    expect(liveShortcut("Meta+K Control+K /", true)).toBe("Meta+K Control+K /");
    expect(liveShortcut("Meta+K Control+K /", false)).toBe("Meta+K Control+K");
    expect(liveShortcut("T", false)).toBeUndefined();
    expect(liveShortcut("Shift+H", false)).toBeUndefined();
    expect(liveShortcut("ArrowLeft PageUp", false)).toBe("ArrowLeft PageUp");
    expect(liveShortcut("mod+B", false)).toBe("mod+B");
    expect(liveShortcut(undefined, false)).toBeUndefined();
  });
});

describe("opensPalette (search: Ctrl/⌘K, Alt+/, /)", () => {
  afterEach(async () => {
    await saveSingleKeys(true);
  });
  const input = el((s) => s === "input");

  it("Ctrl/⌘K and Alt+/ from anywhere, a field too", () => {
    expect(opensPalette(key("k", body, { ctrlKey: true }), noModal)).toBe(true);
    expect(opensPalette(key("K", input, { metaKey: true }), noModal)).toBe(true);
    expect(opensPalette(key("÷", input, { altKey: true, code: "Slash" }), noModal)).toBe(true);
  });

  it("/ on the page, not in a field", () => {
    expect(opensPalette(key("/", body), noModal)).toBe(true);
    expect(opensPalette(key("/", input), noModal)).toBe(false);
  });

  it("single-key shortcuts off: / does nothing, Ctrl/⌘K and Alt+/ still open", async () => {
    await saveSingleKeys(false);
    expect(opensPalette(key("/", body), noModal)).toBe(false);
    expect(opensPalette(key("k", body, { ctrlKey: true }), noModal)).toBe(true);
    expect(opensPalette(key("÷", body, { altKey: true, code: "Slash" }), noModal)).toBe(true);
  });

  it("never over another modal", () => {
    expect(opensPalette(key("k", body, { ctrlKey: true }), modalOpen)).toBe(false);
    expect(opensPalette(key("/", body), modalOpen)).toBe(false);
  });
});
