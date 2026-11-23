import { describe, expect, it } from "vitest";
import { editorTranslation } from "./editor-strings";

describe("editorTranslation (#273: no desktop shortcuts in names on touch)", () => {
  it("desktop keeps the shortcut", () => {
    expect(editorTranslation("en")("toolbar.undo", "Undo {{shortcut}}", { shortcut: "Ctrl+Z" })).toBe("Undo Ctrl+Z");
  });
  it("touch drops it, in either language", () => {
    expect(editorTranslation("en", true)("toolbar.undo", "Undo {{shortcut}}", { shortcut: "Ctrl+Z" })).toBe("Undo");
    expect(editorTranslation("da", true)("toolbar.redo", "Redo {{shortcut}}", { shortcut: "Ctrl+Y" })).toBe("Gentag");
  });
  it("other names are untouched on touch", () => {
    expect(editorTranslation("da", true)("dock.hideKeyboard", "Hide keyboard")).toBe("Skjul tastatur");
  });
});
