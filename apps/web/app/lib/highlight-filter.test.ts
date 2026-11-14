import { describe, expect, it } from "vitest";
import { isShown, revealColor, toggleColor } from "./highlight-filter";

const list = (f: ReturnType<typeof toggleColor>) => (f ? [...f].sort() : null);

describe("colour key filter", () => {
  it("first click: only that colour; next clicks add or remove", () => {
    let f = toggleColor(null, "blue");
    expect(list(f)).toEqual(["blue"]);
    f = toggleColor(f, "rose");
    expect(list(f)).toEqual(["blue", "rose"]);
    f = toggleColor(f, "blue");
    expect(list(f)).toEqual(["rose"]);
    expect(isShown(f, "rose")).toBe(true);
    expect(isShown(f, "gold")).toBe(false);
  });

  it("hiding the last shown colour, or showing all six, is all again", () => {
    expect(toggleColor(toggleColor(null, "blue"), "blue")).toBeNull();
    let f = toggleColor(null, "gold");
    for (const c of ["amber", "green", "blue", "rose", "purple"] as const) f = toggleColor(f, c);
    expect(f).toBeNull();
    expect(isShown(null, "purple")).toBe(true);
  });

  it("highlighting in a hidden colour shows it; a shown one changes nothing", () => {
    const f = toggleColor(null, "blue");
    expect(list(revealColor(f, "green"))).toEqual(["blue", "green"]);
    expect(revealColor(f, "blue")).toBe(f);
    expect(revealColor(null, "blue")).toBeNull();
  });
});
