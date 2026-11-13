import { describe, expect, it } from "vitest";
import { SUPPORT_AFTER_SECONDS, shouldShowSupport } from "./support";

const base = { dismissed: false, seconds: SUPPORT_AFTER_SECONDS, noteOpen: false, busy: false };

describe("shouldShowSupport", () => {
  it("shows once 10 minutes of reading are reached", () => {
    expect(shouldShowSupport(base)).toBe(true);
    expect(shouldShowSupport({ ...base, seconds: SUPPORT_AFTER_SECONDS - 15 })).toBe(false);
  });
  it("never again after it was closed on the account", () => {
    expect(shouldShowSupport({ ...base, dismissed: true })).toBe(false);
  });
  it("never while a note is open or the reader is busy", () => {
    expect(shouldShowSupport({ ...base, noteOpen: true })).toBe(false);
    expect(shouldShowSupport({ ...base, busy: true })).toBe(false);
  });
});
