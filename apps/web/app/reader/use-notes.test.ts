import { describe, expect, it } from "vitest";
import { KEEPALIVE_MAX, patchInit } from "./use-notes";

describe("patchInit (#261: a screen-off save outlives the page)", () => {
  it("a plain save is a plain PATCH", () => {
    expect(patchInit({ body: "x" })).toEqual({ method: "PATCH", body: '{"body":"x"}' });
  });
  it("hiding the page sends it keepalive", () => {
    expect(patchInit({ body: "x" }, { keepalive: true }).keepalive).toBe(true);
  });
  it("a note past keepalive's 64 KB cap goes as a plain request (keepalive would throw)", () => {
    expect(patchInit({ body: "x".repeat(KEEPALIVE_MAX) }, { keepalive: true }).keepalive).toBeUndefined();
  });
});
