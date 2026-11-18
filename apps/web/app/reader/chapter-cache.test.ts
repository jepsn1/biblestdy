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

  it("reads ahead only while the server says the burst has room (RateLimit-Remaining)", async () => {
    let left = 13;
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (!url.startsWith("/api/passages/")) return new Response("[]", { status: 200 });
      left--;
      return new Response(chapterBody(url), { status: 200, headers: { "RateLimit-Remaining": String(left) } });
    });
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    await loadChapter("WEB", { book: "PSA", chapter: 1 }); // 12 left
    for (let c = 2; c <= 10; c++) {
      prefetchNeighbours("WEB", [{ book: "PSA", chapter: c }]);
      await flush();
    }
    // 12 → 11 → 10: the last 10 stay for the reader's own turns
    expect(passageCalls()).toHaveLength(3);
    // …which still load: a run-on page about to be seen is needed
    prefetchNeighbours("WEB", [{ book: "PSA", chapter: 20 }], { needed: true });
    await flush();
    expect(passageCalls()).toHaveLength(4);
  });

  it("joins a request already on its way instead of repeating it", async () => {
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    prefetchNeighbours("WEB", [{ book: "PSA", chapter: 3 }]);
    await loadChapter("WEB", { book: "PSA", chapter: 3 });
    expect(passageCalls()).toEqual(["/api/passages/WEB/PSA/3"]);
  });

  it("a refusal (429) pauses reading ahead; a needed load sits out the wait, then loads", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "pace", retryAfterSeconds: 2 }), {
          status: 429,
          headers: { "retry-after": "2" },
        }),
      );
      const { loadChapter, prefetchNeighbours, readingPausedFor } = await import("./chapter-cache");
      const { ReadingLimited } = await import("./reading-limit");
      const refused = await loadChapter("WEB", { book: "PSA", chapter: 4 }).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(ReadingLimited);
      expect((refused as InstanceType<typeof ReadingLimited>).shortWait).toBe(true);
      expect(readingPausedFor()).toBeGreaterThan(1000);
      prefetchNeighbours("WEB", [{ book: "PSA", chapter: 5 }]);
      const next = loadChapter("WEB", { book: "PSA", chapter: 4 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(passageCalls()).toHaveLength(1); // still waiting
      await vi.advanceTimersByTimeAsync(1500);
      await expect(next).resolves.toMatchObject({ book: "PSA", chapter: 4 });
      expect(passageCalls()).toEqual(["/api/passages/WEB/PSA/4", "/api/passages/WEB/PSA/4"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a long wait (daily cap) is no short wait: the reader shows the limit message", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: "daily", retryAfterSeconds: 3600 }), { status: 429 }),
    );
    const { loadChapter } = await import("./chapter-cache");
    const refused = await loadChapter("WEB", { book: "PSA", chapter: 6 }).catch((e: unknown) => e);
    expect((refused as { shortWait: boolean }).shortWait).toBe(false);
  });

  it("forgets a failed load so the next visit tries again", async () => {
    const { loadChapter } = await import("./chapter-cache");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    await expect(loadChapter("WEB", { book: "JHN", chapter: 5 })).rejects.toBeTruthy();
    await flush();
    await loadChapter("WEB", { book: "JHN", chapter: 5 });
    expect(passageCalls()).toHaveLength(2);
  });

  const prefetchHeader = (i: number) =>
    new Headers((fetchMock.mock.calls[i][1] as RequestInit | undefined)?.headers).get("x-scripture-prefetch");

  it("marks read-ahead low priority (#248); visits and needed run-ons are not", async () => {
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    await loadChapter("WEB", { book: "JHN", chapter: 1 });
    prefetchNeighbours("WEB", [{ book: "JHN", chapter: 2 }]);
    prefetchNeighbours("WEB", [{ book: "JHN", chapter: 3 }], { needed: true });
    await flush();
    const calls = fetchMock.mock.calls.map(([u], i) => ({ u: String(u), h: prefetchHeader(i) }));
    const passage = (c: number) => calls.find((x) => x.u === `/api/passages/WEB/JHN/${c}`)!;
    expect(passage(1).h).toBeNull();
    expect(passage(2).h).toBe("1");
    expect(passage(3).h).toBeNull();
  });

  it("a declined read-ahead (204) keeps nothing, rests reading ahead, and the visit loads", async () => {
    fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("/api/passages/")) return new Response("[]", { status: 200 });
      if (new Headers(init?.headers).get("x-scripture-prefetch")) return new Response(null, { status: 204 });
      return new Response(chapterBody(url), { status: 200 });
    });
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    const { queryClient } = await import("~/lib/query");
    prefetchNeighbours("WEB", [{ book: "ROM", chapter: 8 }]);
    await flush();
    expect(queryClient.getQueryData(["chapter", "WEB", "ROM", 8])).toBeUndefined();
    prefetchNeighbours("WEB", [{ book: "ROM", chapter: 9 }]); // resting
    await flush();
    expect(passageCalls()).toEqual(["/api/passages/WEB/ROM/8"]);
    await expect(loadChapter("WEB", { book: "ROM", chapter: 8 })).resolves.toMatchObject({ chapter: 8 });
    expect(passageCalls()).toHaveLength(2);
  });

  it("a visit that joins a read-ahead the server declines still gets its chapter", async () => {
    fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("/api/passages/")) return new Response("[]", { status: 200 });
      if (new Headers(init?.headers).get("x-scripture-prefetch")) return new Response(null, { status: 204 });
      return new Response(chapterBody(url), { status: 200 });
    });
    const { loadChapter, prefetchNeighbours } = await import("./chapter-cache");
    prefetchNeighbours("WEB", [{ book: "ROM", chapter: 8 }]);
    await expect(loadChapter("WEB", { book: "ROM", chapter: 8 })).resolves.toMatchObject({ chapter: 8 });
    expect(passageCalls()).toEqual(["/api/passages/WEB/ROM/8", "/api/passages/WEB/ROM/8"]);
  });

  it("a reader drawing it meanwhile (a query observer) turns a declined read-ahead into a real load", async () => {
    fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("/api/passages/")) return new Response("[]", { status: 200 });
      if (new Headers(init?.headers).get("x-scripture-prefetch")) return new Response(null, { status: 204 });
      return new Response(chapterBody(url), { status: 200 });
    });
    const { chapterQuery, prefetchNeighbours } = await import("./chapter-cache");
    const { queryClient } = await import("~/lib/query");
    const { QueryObserver } = await import("@tanstack/react-query");
    prefetchNeighbours("WEB", [{ book: "ROM", chapter: 8 }]);
    const observer = new QueryObserver(queryClient, chapterQuery("WEB", { book: "ROM", chapter: 8 }));
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryClient.getQueryData(["chapter", "WEB", "ROM", 8])).toBeTruthy());
    unsubscribe();
    expect(passageCalls()).toEqual(["/api/passages/WEB/ROM/8", "/api/passages/WEB/ROM/8"]);
  });
});
