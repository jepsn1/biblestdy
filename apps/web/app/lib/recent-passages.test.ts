import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushRecent, readRecent } from "./recent-passages";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});

describe("recent passages", () => {
  it("newest first, deduped, capped at 8", () => {
    for (let c = 1; c <= 10; c++) pushRecent({ book: "PSA", chapter: c });
    pushRecent({ book: "PSA", chapter: 5 });
    const r = readRecent();
    expect(r).toHaveLength(8);
    expect(r[0]).toEqual({ book: "PSA", chapter: 5 });
    expect(r.filter((x) => x.chapter === 5)).toHaveLength(1);
  });

  it("survives broken or blocked storage", () => {
    store.set("recentPassages", "{nope");
    expect(readRecent()).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => pushRecent({ book: "JHN", chapter: 3 })).not.toThrow();
    expect(readRecent()).toEqual([]);
  });
});
