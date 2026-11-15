import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchScripture } from "./scripture-fetch";

function stubFetch(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status }));
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

describe("fetchScripture (expired-session gate, #26)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["/api/translations", "/api/passages/WEB/JHN/3"])(
    "redirects to /signin when %s answers 401",
    async (url) => {
      stubFetch(401);
      const err = await thrown(fetchScripture(url, "/"));
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(302);
      expect((err as Response).headers.get("Location")).toBe("/signin");
    },
  );

  it("comes back to the page it was going to after sign-in", async () => {
    stubFetch(401);
    const err = await thrown(fetchScripture("/api/passages/WEB/ROM/8", "/read/ROM/8?p=2"));
    expect((err as Response).headers.get("Location")).toBe("/signin?next=%2Fread%2FROM%2F8%3Fp%3D2");
  });

  it("hands every other response back to the caller, with the session cookie", async () => {
    const fetchMock = stubFetch(404);
    const res = await fetchScripture("/api/passages/WEB/JHN/4");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith("/api/passages/WEB/JHN/4", { credentials: "include" });
  });
});
