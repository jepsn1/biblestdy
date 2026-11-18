import type { Chapter, Verse } from "@biblestdy/shared";
import { mapRange, unionRange } from "@biblestdy/shared/versification";
import { data } from "react-router";
import { describe, expect, it } from "vitest";
import {
  blockError,
  blockView,
  fumsTokens,
  sliceChapters,
  type Loaded,
} from "./compare-blocks";
import { ReadingLimited } from "./reading-limit";

// Verse numbers only — placeholder words, never licensed text
const words = (n: number) => `w${n} x${n}`;
function chapter(book: string, n: number, verses: (number | [number, string])[], extra: Partial<Chapter> = {}): Chapter {
  const vs: Verse[] = verses.map((v) => (Array.isArray(v) ? { verse: v[0], label: v[1], text: words(v[0]) } : { verse: v, text: words(v) }));
  return { translationId: "t", book, chapter: n, verses: vs, ...extra };
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const loader = (chapters: Chapter[]) => (c: { book: string; chapter: number }): Loaded => {
  const hit = chapters.find((x) => x.book === c.book && x.chapter === c.chapter);
  return hit ? { status: "ok", chapter: hit } : { status: "pending" };
};

describe("blockError", () => {
  const limited = (reason: "pace" | "daily" | "cooldown", s: number) => new ReadingLimited({ reason, retryAfterSeconds: s }, "x");
  it("reads reading-quota refusals", () => {
    expect(blockError(limited("pace", 4))).toBe("limited-short");
    expect(blockError(limited("cooldown", 900))).toBe("limited-long");
    expect(blockError(limited("daily", 30))).toBe("daily");
  });
  it("reads route payloads (not Errors) and anything else", () => {
    expect(blockError(data("gone", { status: 404 }))).toBe("unavailable");
    expect(blockError(data("bad", { status: 502 }))).toBe("failed");
    expect(blockError(new Error("network"))).toBe("failed");
    expect(blockError(undefined)).toBe("failed");
  });
});

describe("blockView", () => {
  it("Ps 51:1 (WEB) is BPH 51:3, with the numbering note", () => {
    const slices = mapRange({ book: "PSA", chapter: 51, verse: 1 }, "WEB", "BPH");
    const bph = chapter("PSA", 51, [[1, "1–2"], ...range(3, 21)], { fumsToken: "bph-51" });
    const v = blockView(slices, loader([bph]));
    expect(v.kind).toBe("ready");
    if (v.kind !== "ready") return;
    expect(v.ref).toEqual({ book: "PSA", chapter: 51, verse: 3 });
    expect(v.notes).toEqual([{ kind: "renumbered", source: { book: "PSA", chapter: 51, verse: 1 } }]);
    expect(v.parts.map((p) => [p.from, p.to])).toEqual([[3, 3]]);
  });

  it("Mal 4:1 (NIV) is BPH 3:19", () => {
    const slices = mapRange({ book: "MAL", chapter: 4, verse: 1 }, "NIV", "BPH");
    expect(sliceChapters(slices)).toEqual([{ book: "MAL", chapter: 3 }]);
    const v = blockView(slices, loader([chapter("MAL", 3, range(1, 24))]));
    expect(v.kind === "ready" && v.ref).toEqual({ book: "MAL", chapter: 3, verse: 19 });
  });

  it("John 3:15 (NIV) widens to 14–15 when BPH bridges them", () => {
    const bph = chapter("JHN", 3, [...range(1, 13), [14, "14–15"], ...range(16, 36)]);
    const { ref, widened } = unionRange({ book: "JHN", chapter: 3, verse: 15 }, "NIV", [{ numbering: "BPH", chapters: [bph] }]);
    expect(widened).toBe(true);
    expect(ref).toEqual({ book: "JHN", chapter: 3, verse: 14, endVerse: 15 });
    const v = blockView(mapRange(ref, "NIV", "BPH"), loader([bph]));
    expect(v.kind === "ready" && v.ref).toEqual({ book: "JHN", chapter: 3, verse: 14, endVerse: 15 });
  });

  it("Acts 8:37 (NKJV): NIV has no verse 37, its neighbours show", () => {
    const niv = chapter("ACT", 8, [...range(1, 36), ...range(38, 40)]);
    const v = blockView(mapRange({ book: "ACT", chapter: 8, verse: 37 }, "NKJV", "NIV"), loader([niv]));
    expect(v.kind).toBe("ready");
    if (v.kind !== "ready") return;
    expect(v.notes).toEqual([{ kind: "absent", verses: [37] }]);
    expect(v.parts.map((p) => [p.from, p.to])).toEqual([[36, 38]]);
  });

  it("Rom 16:25 (NIV) is placed at WEB 14:24", () => {
    const web = chapter("ROM", 14, range(1, 26));
    const slices = mapRange({ book: "ROM", chapter: 16, verse: 25 }, "NIV", "WEB");
    const v = blockView(slices, loader([web]));
    expect(v.kind === "ready" && v.notes).toEqual([{ kind: "moved", ref: { book: "ROM", chapter: 14, verse: 24 } }]);
  });

  it("a 404 on a mapped chapter says it couldn't match — never the same number", () => {
    const slices = mapRange({ book: "MAL", chapter: 4, verse: 1 }, "NIV", "WEB");
    const v = blockView(slices, () => ({ status: "error", error: data("gone", { status: 404 }) }));
    expect(v.kind === "ready" && v.notes).toEqual([{ kind: "unmapped" }]);
    expect(v.kind === "ready" && v.parts).toEqual([]);
    expect(v.kind === "ready" && v.missing).toEqual([{ book: "MAL", chapter: 4 }]);
  });

  it("the BPH psalm title has no verse in WEB", () => {
    const slices = mapRange({ book: "PSA", chapter: 51, verse: 1 }, "BPH", "WEB");
    const v = blockView(slices, loader([]));
    expect(v.kind === "ready" && v.notes).toEqual([{ kind: "psalmTitle" }]);
  });

  it("limits: short waits keep loading, long ones and failures are this block's message", () => {
    const slices = mapRange({ book: "JHN", chapter: 3, verse: 16 }, "NIV", "WEB");
    const err = (e: unknown) => () => ({ status: "error", error: e }) as Loaded;
    expect(blockView(slices, () => ({ status: "pending", limited: true }))).toEqual({ kind: "loading", limited: true, verses: 1 });
    expect(blockView(slices, err(new ReadingLimited({ reason: "pace", retryAfterSeconds: 5 }, "")))).toMatchObject({ kind: "loading", limited: true });
    expect(blockView(slices, err(new ReadingLimited({ reason: "cooldown", retryAfterSeconds: 900 }, "")))).toMatchObject({ kind: "problem", error: "limited-long", wait: 900 });
    expect(blockView(slices, err(new ReadingLimited({ reason: "daily", retryAfterSeconds: 9000 }, "")))).toMatchObject({ kind: "problem", error: "daily" });
    expect(blockView(slices, err(new Error("x")))).toMatchObject({ kind: "problem", error: "failed" });
  });
});

describe("FUMS per shown chapter", () => {
  // Joel 2:32–3:1 (WEB) spans BPH 3:5 and 4:1
  const slices = mapRange({ book: "JOL", chapter: 2, verse: 32, endChapter: 3, endVerse: 1 }, "WEB", "BPH");
  const c3 = chapter("JOL", 3, range(1, 5), { fumsToken: "bph-3" });
  const c4 = chapter("JOL", 4, range(1, 21), { fumsToken: "bph-4" });

  it("a cross-chapter block reports 2 tokens once both are on screen", () => {
    expect(sliceChapters(slices)).toEqual([{ book: "JOL", chapter: 3 }, { book: "JOL", chapter: 4 }]);
    expect(fumsTokens([blockView(slices, loader([c3, c4]))])).toEqual(["bph-3", "bph-4"]);
  });

  it("nothing while the skeleton shows (one chapter still coming)", () => {
    expect(fumsTokens([blockView(slices, loader([c3]))])).toEqual([]);
  });

  it("a translation unticked before it arrives reports 0", () => {
    expect(fumsTokens([])).toEqual([]);
  });
});
