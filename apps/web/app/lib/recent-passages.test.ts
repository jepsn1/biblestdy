import { beforeEach, describe, expect, it, vi } from "vitest";
import { notePage, placesToOffer, pushRecent, readRecent } from "./recent-passages";

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

  it("keeps the page last open, also when the chapter is opened again", () => {
    pushRecent({ book: "JHN", chapter: 3 });
    notePage({ book: "JHN", chapter: 3 }, 1);
    pushRecent({ book: "PSA", chapter: 23 });
    pushRecent({ book: "JHN", chapter: 3 });
    expect(readRecent()).toEqual([
      { book: "JHN", chapter: 3, page: 1 },
      { book: "PSA", chapter: 23 },
    ]);
    notePage({ book: "JHN", chapter: 3 }, 0);
    expect(readRecent()[0]).toEqual({ book: "JHN", chapter: 3 });
  });

  it("offers Continue = the newest place that isn't here, then the rest; start places to a newcomer", () => {
    const recent = [
      { book: "PSA", chapter: 23 },
      { book: "JHN", chapter: 3, page: 1 },
      { book: "ROM", chapter: 8 },
    ];
    expect(placesToOffer(recent, { book: "PSA", chapter: 23 })).toEqual({
      continueAt: { book: "JHN", chapter: 3, page: 1 },
      recent: [{ book: "ROM", chapter: 8 }],
      start: false,
    });
    expect(placesToOffer(recent.slice(0, 1), { book: "PSA", chapter: 23 })).toEqual({ continueAt: null, recent: [], start: true });
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
