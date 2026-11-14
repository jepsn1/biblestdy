import { beforeEach, describe, expect, it, vi } from "vitest";
import { SNOOZE_MS, SUPPORT_AFTER_SECONDS, shouldShowSupport, snoozeSupport, supportSnoozed } from "./support";

const base = { snoozed: false, seconds: SUPPORT_AFTER_SECONDS, noteOpen: false, busy: false };

describe("shouldShowSupport", () => {
  it("shows once 10 minutes of reading are reached", () => {
    expect(shouldShowSupport(base)).toBe(true);
    expect(shouldShowSupport({ ...base, seconds: SUPPORT_AFTER_SECONDS - 15 })).toBe(false);
  });
  it("not while snoozed", () => {
    expect(shouldShowSupport({ ...base, snoozed: true })).toBe(false);
  });
  it("never while a note is open or the reader is busy", () => {
    expect(shouldShowSupport({ ...base, noteOpen: true })).toBe(false);
    expect(shouldShowSupport({ ...base, busy: true })).toBe(false);
  });
});

describe("snooze", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });

  it("closing hides it for 30 days on this device, then it comes back", () => {
    const now = 1_000_000;
    expect(supportSnoozed("u1", now)).toBe(false);
    snoozeSupport("u1", now);
    expect(supportSnoozed("u1", now + SNOOZE_MS - 1)).toBe(true);
    expect(supportSnoozed("u1", now + SNOOZE_MS)).toBe(false);
    expect(supportSnoozed("u2", now)).toBe(false);
  });
});
