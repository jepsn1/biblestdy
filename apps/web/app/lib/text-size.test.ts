import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from "@biblestdy/shared";
import { parseTextSize } from "./text-size";
import { PREPAINT_SIZES, TEXT_SIZE_PREPAINT } from "./text-size-prepaint";

describe("parseTextSize (#61)", () => {
  it("keeps the five supported steps", () => {
    for (const s of ["100", "125", "150", "175", "200"]) expect(parseTextSize(s)).toBe(Number(s));
  });

  it("falls back to 100% for missing or junk values", () => {
    for (const s of [null, undefined, "", "110", "300", "big", "1.5"]) {
      expect(parseTextSize(s)).toBe(100);
    }
  });
});

/** Runs root.tsx's inline script against a fake document + localStorage. */
function prepaint(stored: string | null, storageThrows = false) {
  const html = { style: { fontSize: "" } };
  const localStorage = {
    getItem: () => {
      if (storageThrows) throw new Error("blocked");
      return stored;
    },
  };
  new Function("document", "localStorage", TEXT_SIZE_PREPAINT)(
    { documentElement: html },
    localStorage,
  );
  return html.style.fontSize;
}

describe("TEXT_SIZE_PREPAINT (#61)", () => {
  it("knows every non-default size", () => {
    expect(PREPAINT_SIZES).toEqual(TEXT_SIZES.filter((s) => s !== DEFAULT_TEXT_SIZE));
  });

  it("applies a stored size before first paint", () => {
    expect(prepaint("150")).toBe("150%");
    expect(prepaint("200")).toBe("200%");
  });

  it("leaves the default and junk alone (no inline style)", () => {
    expect(prepaint("100")).toBe("");
    expect(prepaint(null)).toBe("");
    expect(prepaint("999")).toBe("");
  });

  it("never throws when storage is blocked", () => {
    expect(prepaint("150", true)).toBe("");
  });
});
