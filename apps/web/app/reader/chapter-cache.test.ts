import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Chapter cache + read-ahead: a turn renders from memory, and reading ahead
 * stays well inside the reading quota (#29). */
function chapterBody(url: string) {
  const [, , , translationId, book, chapter] = url.split("/");
  return JSON.stringify({ translationId, book, chapter: Number(chapter), verses: [] });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("/api/passages/")) return new Response(chapterBody(url), { status: 200 });
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const passageCalls = () =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/passages/"));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("chapter cache", () => {
  it("loads a chapter once; later loads come from memory", async () => {
    const { loadChapter } = await import("./chapter-cache");
    const a = await loadChapter("WEB", { book: "JHN", chapter: 3 });
    const b = await loadChapter("WEB", { book: "JHN", chapter: 3 });
    expect(b).toBe(a);
    expect(passageCalls()).toEqual(["/api/passages/WEB/JHN/3"]);
  });

  it("prefetches neighbours (text + marks) and skips what is already here", async () => {
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    await loadChapter("WEB", { book: "JHN", chapter: 2 });
    prefetchNeighbours("WEB", [{ book: "JHN", chapter: 4 }, { book: "JHN", chapter: 2 }]);
    await flush();
    expect(passageCalls()).toEqual(["/api/passages/WEB/JHN/2", "/api/passages/WEB/JHN/4"]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/annotations?") && String(u).includes("chapter=4"))).toBe(true);
    await loadChapter("WEB", { book: "JHN", chapter: 4 });
    expect(passageCalls()).toHaveLength(2);
  });

  it("stops reading ahead once a minute's budget of fetches is spent", async () => {
    const { prefetchNeighbours } = await import("./chapter-cache");
    for (let c = 1; c <= 10; c++) prefetchNeighbours("WEB", [{ book: "GEN", chapter: c }]);
    await flush();
    expect(passageCalls()).toHaveLength(6);
  });

  it("forgets a failed load so the next visit tries again", async () => {
    const { loadChapter } = await import("./chapter-cache");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    await expect(loadChapter("WEB", { book: "JHN", chapter: 5 })).rejects.toBeTruthy();
    await flush();
    await loadChapter("WEB", { book: "JHN", chapter: 5 });
    expect(passageCalls()).toHaveLength(2);
  });
});
