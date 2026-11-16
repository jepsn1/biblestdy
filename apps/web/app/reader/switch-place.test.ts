import { describe, expect, it } from "vitest";
import { checkLanding, switchLanding } from "./switch-place";

const at = (book: string, chapter: number, verse: number) => ({ book, chapter, verse });

describe("switchLanding (#174)", () => {
  it("WEB Malachi 4 lands on BPH Malakias 3,19–24 and back", () => {
    expect(switchLanding(at("MAL", 4, 1), "WEB", "BPH")).toEqual({ ...at("MAL", 3, 19), note: "renumbered" });
    expect(switchLanding(at("MAL", 4, 6), "WEB", "BPH")).toEqual({ ...at("MAL", 3, 24), note: "renumbered" });
    expect(switchLanding(at("MAL", 3, 19), "BPH", "WEB")).toEqual({ ...at("MAL", 4, 1), note: "renumbered" });
    expect(switchLanding(at("MAL", 3, 18), "BPH", "WEB")).toEqual({ ...at("MAL", 3, 18), note: null });
  });

  it("NIV Psalm 51:1 lands on BPH 51,3, past the title", () => {
    expect(switchLanding(at("PSA", 51, 1), "NIV", "BPH")).toEqual({ ...at("PSA", 51, 3), note: "renumbered" });
    expect(switchLanding(at("PSA", 51, 3), "BPH", "NIV")).toEqual({ ...at("PSA", 51, 1), note: "renumbered" });
  });

  it("a BPH psalm title lands on verse 1 in English, with a note", () => {
    expect(switchLanding(at("PSA", 51, 1), "BPH", "NIV")).toEqual({ ...at("PSA", 51, 1), note: "title" });
    expect(switchLanding(at("PSA", 51, 2), "BPH", "NKJV")).toEqual({ ...at("PSA", 51, 1), note: "title" });
  });

  it("English Joel 3 is BPH Joel 4; Joel 2:28 is BPH 3,1", () => {
    expect(switchLanding(at("JOL", 3, 1), "NIV", "BPH")).toEqual({ ...at("JOL", 4, 1), note: "renumbered" });
    expect(switchLanding(at("JOL", 2, 28), "NIV", "BPH")).toEqual({ ...at("JOL", 3, 1), note: "renumbered" });
    expect(switchLanding(at("JOL", 4, 1), "BPH", "WEB")).toEqual({ ...at("JOL", 3, 1), note: "renumbered" });
  });

  it("keeps the number where the numberings agree", () => {
    expect(switchLanding(at("JHN", 3, 16), "NIV", "BPH")).toEqual({ ...at("JHN", 3, 16), note: null });
    expect(switchLanding(at("JHN", 3, 16), "NIV", "WEB")).toEqual({ ...at("JHN", 3, 16), note: null });
    expect(switchLanding(at("MAL", 4, 1), "NIV", "WEB")).toEqual({ ...at("MAL", 4, 1), note: null });
  });

  it("text placed elsewhere follows it (WEB doxology at Rom 14:24)", () => {
    expect(switchLanding(at("ROM", 16, 25), "NIV", "WEB")).toEqual({ ...at("ROM", 14, 24), note: "renumbered" });
    expect(switchLanding(at("ROM", 14, 24), "WEB", "NIV")).toEqual({ ...at("ROM", 16, 25), note: "renumbered" });
  });

  it("no counterpart: the nearest mapped verse, never the same number silently", () => {
    const l = switchLanding(at("NEH", 7, 68), "NIV", "BPH");
    expect(l.note).toBe("nearest");
    expect(l.chapter).toBe(7);
    expect(l.verse).not.toBe(68);
  });
});

describe("checkLanding", () => {
  const chapter = (verses: number[], book = "ACT", c = 8) => ({ book, chapter: c, verses: verses.map((verse) => ({ verse })) });

  it("a verse this edition leaves out gets the nearest-verse note", () => {
    const landing = { ...at("ACT", 8, 37), note: null };
    expect(checkLanding(landing, chapter([35, 36, 38])).note).toBe("nearest");
    expect(checkLanding(landing, chapter([35, 36, 37, 38])).note).toBeNull();
  });

  it("a verse inside a bridge is there", () => {
    const landing = { ...at("JHN", 3, 15), note: null };
    expect(checkLanding(landing, { book: "JHN", chapter: 3, verses: [{ verse: 14, label: "14–15" }, { verse: 16 }] }).note).toBeNull();
  });

  it("keeps an earlier note", () => {
    expect(checkLanding({ ...at("PSA", 51, 3), note: "renumbered" }, chapter([1, 2, 3], "PSA", 51)).note).toBe("renumbered");
  });
});
