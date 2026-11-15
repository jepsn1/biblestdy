import { describe, expect, it } from "vitest";
import { filterPlaces, placeLabel } from "./place-filter";

describe("filterPlaces", () => {
  it("empty: every book, nothing picked", () => {
    const f = filterPlaces("  ", "da");
    expect(f.books).toHaveLength(66);
    expect(f.best).toBeNull();
    expect(f.passage).toBeNull();
  });

  it("matches the start of a name, not the middle (sal ≠ Thessalonikerbrev)", () => {
    const f = filterPlaces("sal", "da");
    expect(f.books).toContain("PSA");
    expect(f.books).not.toContain("1TH");
    expect(f.best).toBe("PSA");
    expect(f.passage).toBeNull();
  });

  it("English names work in the Danish UI and the other way round", () => {
    expect(filterPlaces("john", "da").books).toContain("JHN");
    expect(filterPlaces("romer", "en").best).toBe("ROM");
  });

  it("keeps canonical order; best = the strongest match", () => {
    const f = filterPlaces("joh", "da");
    expect(f.books.indexOf("JHN")).toBeLessThan(f.books.indexOf("1JN"));
    expect(f.best).toBe("JHN");
  });

  it("a passage goes straight there (the palette's parser)", () => {
    const f = filterPlaces("sal 23", "da");
    expect(f.passage).toMatchObject({ href: "/read/PSA/23", book: "PSA", chapter: 23 });
    expect(f.books).toEqual(["PSA"]);
    expect(filterPlaces("joh 3:16", "da").passage?.href).toBe("/read/JHN/3?v=16");
    expect(filterPlaces("rom 8", "en").passage?.href).toBe("/read/ROM/8");
  });

  it("a misspelt name still finds its book", () => {
    expect(filterPlaces("phillipians", "en").books).toContain("PHP");
  });

  it("no match: empty", () => {
    const f = filterPlaces("xyzzy", "en");
    expect(f.books).toEqual([]);
    expect(f.best).toBeNull();
  });
});

describe("placeLabel", () => {
  it("Danish comma, English colon", () => {
    expect(placeLabel({ href: "", book: "JHN", chapter: 3, verse: 16 }, "da")).toBe("Johannes 3,16");
    expect(placeLabel({ href: "", book: "PSA", chapter: 23 }, "en")).toBe("Psalms 23");
  });
});
