import { describe, expect, it } from "vitest";
import { nextListType } from "./dock-bar";

describe("the format panel's list row (#277)", () => {
  it("the lit list turns the list off; another one switches to it", () => {
    expect(nextListType("bullet", "bullet")).toBe("");
    expect(nextListType("bullet", "number")).toBe("number");
    expect(nextListType("", "check")).toBe("check");
  });
});
