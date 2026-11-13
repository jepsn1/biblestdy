import { describe, expect, it } from "vitest";
import { parseThemePref, resolveDark } from "./theme";
import { THEME_PREPAINT } from "./theme-prepaint";

describe("theme preference (#62)", () => {
  it("parses the three choices, junk falls back to light (Paper default)", () => {
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("system")).toBe("system");
    for (const v of [null, undefined, "", "charcoal"]) expect(parseThemePref(v)).toBe("light");
  });

  it("system follows the OS; light/dark ignore it", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });
});

/** Runs root.tsx's inline script against fakes. */
function prepaint(stored: string | null, osDark: boolean, storageThrows = false) {
  const classes = new Set<string>();
  const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  const localStorage = {
    getItem: () => {
      if (storageThrows) throw new Error("blocked");
      return stored;
    },
  };
  const matchMedia = () => ({ matches: osDark });
  new Function("document", "localStorage", "matchMedia", THEME_PREPAINT)(
    document,
    localStorage,
    matchMedia,
  );
  return classes.has("dark");
}

describe("THEME_PREPAINT (#62)", () => {
  it("applies dark, and system when the OS is dark", () => {
    expect(prepaint("dark", false)).toBe(true);
    expect(prepaint("system", true)).toBe(true);
  });

  it("stays light for light, system-on-light-OS, nothing stored, blocked storage", () => {
    expect(prepaint("light", true)).toBe(false);
    expect(prepaint("system", false)).toBe(false);
    expect(prepaint(null, true)).toBe(false);
    expect(prepaint("dark", true, true)).toBe(false);
  });
});
