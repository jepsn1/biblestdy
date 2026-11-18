import { describe, expect, it } from "vitest";
import { toHex } from "./theme-color";

describe("theme-color (#251)", () => {
  it("serialises a pixel as #rrggbb", () => {
    expect(toHex(246, 242, 233)).toBe("#f6f2e9");
    expect(toHex(0, 10, 255)).toBe("#000aff");
  });
});
