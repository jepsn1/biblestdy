import { describe, expect, it } from "vitest";
import { compareCap, filterTranslations, FILTER_FROM, initialPicks, parsePicks, togglePick } from "./compare-picks";

const others = ["niv", "nkjv", "bph"];

describe("compare picks", () => {
  it("caps at 3 and at the others available", () => {
    expect(compareCap(4)).toBe(3);
    expect(compareCap(6)).toBe(3);
    expect(compareCap(2)).toBe(1);
    expect(compareCap(1)).toBe(0);
  });

  it("first open (nothing stored) ticks all others up to the cap", () => {
    expect(initialPicks(null, others, 3)).toEqual(others);
    expect(initialPicks(null, ["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("restores stored picks in picker order", () => {
    expect(initialPicks(JSON.stringify(["bph", "niv"]), others, 3)).toEqual(["niv", "bph"]);
  });

  it("an empty stored list stays empty (the reader unticked all)", () => {
    expect(initialPicks("[]", others, 3)).toEqual([]);
  });

  it("drops unknown ids, the reading translation, duplicates and non-strings", () => {
    // "web" (the reading one) is not among `others`
    expect(parsePicks(JSON.stringify(["web", "gone", "bph", "bph", 7, null]), others, 3)).toEqual(["bph"]);
  });

  it("caps the stored list", () => {
    expect(parsePicks(JSON.stringify(["a", "b", "c", "d"]), ["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("unreadable storage = first open", () => {
    expect(parsePicks("{oops", others, 3)).toBeNull();
    expect(parsePicks(JSON.stringify({ a: 1 }), others, 3)).toBeNull();
    expect(initialPicks("{oops", others, 3)).toEqual(others);
  });

  it("toggles in picker order and refuses a tick over the cap", () => {
    expect(togglePick(["bph"], "niv", true, others, 3)).toEqual(["niv", "bph"]);
    expect(togglePick(["niv", "bph"], "niv", false, others, 3)).toEqual(["bph"]);
    expect(togglePick(["niv", "bph"], "nkjv", true, others, 2)).toBeNull();
  });

});

describe("picker filter (#258)", () => {
  const list = [
    { a: "NIV", name: "New International Version" },
    { a: "BPH", name: "Bibelen på hverdagsdansk" },
    { a: "DA1931", name: "Dansk 1931" },
  ];
  const words = (x: (typeof list)[number]) => [x.a, x.name];

  it("keeps all for an empty or blank query", () => {
    expect(filterTranslations(list, "", words)).toEqual(list);
    expect(filterTranslations(list, "   ", words)).toEqual(list);
  });

  it("matches any case, across abbreviation and name, every word", () => {
    expect(filterTranslations(list, "dansk", words).map((x) => x.a)).toEqual(["BPH", "DA1931"]);
    expect(filterTranslations(list, "niv", words).map((x) => x.a)).toEqual(["NIV"]);
    expect(filterTranslations(list, "dansk 1931", words).map((x) => x.a)).toEqual(["DA1931"]);
    expect(filterTranslations(list, "Hverdags", words).map((x) => x.a)).toEqual(["BPH"]);
    expect(filterTranslations(list, "zzz", words)).toEqual([]);
  });

  it("only offers a filter for longer lists", () => {
    expect(FILTER_FROM).toBeGreaterThan(6);
  });
});
