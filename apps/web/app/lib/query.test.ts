import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, api, bouncingInLoop, shouldRetry, updateList } from "./query";

function stubFetch(status: number, body: string, type = "application/json") {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status, headers: { "Content-Type": type } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function thrown(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a throw");
}

describe("api() errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws an ApiError with the status and the parsed JSON body", async () => {
    stubFetch(500, JSON.stringify({ message: "boom" }));
    const err = await thrown(api("/api/highlights"));
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).body).toEqual({ message: "boom" });
    expect((err as ApiError).message).toBe("GET /api/highlights -> 500");
  });

  it("keeps a non-JSON body as text, an empty one as null", async () => {
    stubFetch(502, "Bad Gateway", "text/plain");
    expect(((await thrown(api("/api/notes"))) as ApiError).body).toBe("Bad Gateway");
    stubFetch(404, "");
    expect(((await thrown(api("/api/notes/x", { method: "DELETE" }))) as ApiError).body).toBeNull();
  });

  it("sends a 401 to sign-in, back to the current page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/read/ROM/8", search: "?p=2", hash: "", assign } });
    stubFetch(401, JSON.stringify({ message: "Unauthorized" }));
    const err = await thrown(api("/api/notes/1", { method: "PATCH", body: "{}" }));
    expect((err as ApiError).status).toBe(401);
    expect(assign).toHaveBeenCalledWith("/signin?next=%2Fread%2FROM%2F8%3Fp%3D2");
  });
});

describe("shouldRetry", () => {
  it("retries a server failure or network error once", () => {
    expect(shouldRetry(0, new ApiError(500, null, ""))).toBe(true);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, null, ""))).toBe(false);
  });

  it.each([400, 401, 403, 404, 429])("never retries a %d", (status) => {
    expect(shouldRetry(0, new ApiError(status, null, ""))).toBe(false);
  });
});

describe("updateList", () => {
  const key = ["highlights", "WEB", "JHN", 3];

  it("adds to a loaded list", () => {
    const qc = new QueryClient();
    qc.setQueryData(key, ["a"]);
    updateList<string>(qc, key, (l) => [...l, "b"]);
    expect(qc.getQueryData(key)).toEqual(["a", "b"]);
  });

  it("never caches a lone new row over a failed load — refetches instead", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(500, null, "")) });
    expect(qc.getQueryState(key)?.status).toBe("error");
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    updateList<string>(qc, key, (l) => [...l, "b"]);
    expect(qc.getQueryData(key)).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key, exact: true });
  });
});

describe("bouncingInLoop (sign-in redirect breaker)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets three bounces a minute through, then stops; old ones expire", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const t = 1_000_000;
    expect([bouncingInLoop(t), bouncingInLoop(t + 1), bouncingInLoop(t + 2)]).toEqual([false, false, false]);
    expect(bouncingInLoop(t + 3)).toBe(true);
    expect(bouncingInLoop(t + 61_000)).toBe(false);
  });
});
