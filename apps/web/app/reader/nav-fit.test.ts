import { describe, expect, it } from "vitest";
import { fitsOneRow, NAME_MIN_EM } from "./nav-fit";

// A 390px phone at 100%: sidebar, divider, chapter, WEB, search icon, More
const phone = [28, 1, 48, 70, 28, 72].map((width) => ({ width, minWidth: 0 }));
const base = { gap: 4, padding: 24, nameMin: NAME_MIN_EM * 16 };

describe("fitsOneRow", () => {
  it("a phone at 100% keeps one row", () => {
    expect(fitsOneRow({ ...base, items: phone, available: 390 })).toBe(true);
  });

  it("wraps when the controls leave the name less than its minimum", () => {
    // 150%: every control and the name's minimum half as wide again
    const big = phone.map((i) => ({ width: i.width * 1.5, minWidth: 0 }));
    expect(fitsOneRow({ ...base, gap: 6, padding: 36, nameMin: NAME_MIN_EM * 24, items: big, available: 390 })).toBe(false);
  });

  it("counts a shrinkable control at its minimum (the search field gives way first)", () => {
    const desk = [...phone.slice(0, 4), { width: 288, minWidth: 160 }, { width: 28, minWidth: 0 }];
    // 288 wide it wouldn't fit; at its 160 minimum it does
    expect(fitsOneRow({ ...base, items: desk, available: 520 })).toBe(true);
    expect(fitsOneRow({ ...base, items: desk.map((i) => ({ ...i, minWidth: 0 })), available: 520 })).toBe(false);
  });

  it("is exact at the edge (sub-pixel tolerance only)", () => {
    const need = phone.reduce((s, i) => s + i.width, 0) + 4 * phone.length + 24 + base.nameMin;
    expect(fitsOneRow({ ...base, items: phone, available: need })).toBe(true);
    expect(fitsOneRow({ ...base, items: phone, available: need - 1 })).toBe(false);
  });
});
