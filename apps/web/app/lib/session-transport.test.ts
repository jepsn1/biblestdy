import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  authFetchOptions,
  clearSessionToken,
  resetSessionTransport,
  saveSessionToken,
  sessionReady,
  sessionToken,
  withSession,
  type TokenStore,
} from "./session-transport";

/** In-memory stand-in for the Keychain. */
function memoryStore(initial: string | null = null) {
  let value = initial;
  const store: TokenStore & { value: () => string | null } = {
    get: () => Promise.resolve(value),
    set: (t) => {
      value = t;
      return Promise.resolve();
    },
    remove: () => {
      value = null;
      return Promise.resolve();
    },
    value: () => value,
  };
  return store;
}

const sentInit = (fetch: ReturnType<typeof vi.fn>) => (fetch.mock.calls[0] as [string, RequestInit])[1];
const sentAuth = (fetch: ReturnType<typeof vi.fn>) => new Headers(sentInit(fetch).headers).get("authorization");

describe("withSession (pure)", () => {
  it("web: exactly the old cookie request — credentials included, headers untouched", () => {
    const headers = { "Content-Type": "application/json" };
    expect(withSession({ method: "POST", headers, body: "{}" }, "cookie", "tok")).toEqual({
      credentials: "include",
      method: "POST",
      headers,
      body: "{}",
    });
    expect(withSession(undefined, "cookie", null)).toEqual({ credentials: "include" });
  });

  it("shell: bearer header, cookies off, the caller's headers kept", () => {
    const init = withSession({ method: "PATCH", headers: { "Content-Type": "application/json" } }, "bearer", "abc.sig");
    expect(init.credentials).toBe("omit");
    expect(init.method).toBe("PATCH");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer abc.sig");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("shell, signed out: no Authorization header at all", () => {
    expect(new Headers(withSession(undefined, "bearer", null).headers).has("authorization")).toBe(false);
  });
});

describe("apiFetch", () => {
  const fetch = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response("{}", { status: 200 })));
  beforeEach(() => {
    vi.stubGlobal("fetch", fetch);
    fetch.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionTransport();
  });

  it("web: same-origin path, cookie credentials, no bearer header", async () => {
    resetSessionTransport({ mode: "cookie", token: "ignored" });
    await apiFetch("/api/notes");
    expect(fetch.mock.calls[0][0]).toBe("/api/notes");
    expect(sentInit(fetch).credentials).toBe("include");
    expect(sentAuth(fetch)).toBeNull();
  });

  it("shell: the stored token rides on every call after launch", async () => {
    resetSessionTransport({ mode: "bearer", store: memoryStore("kept.sig") });
    await sessionReady();
    expect(sessionToken()).toBe("kept.sig");
    await apiFetch("/api/notes");
    expect(sentAuth(fetch)).toBe("Bearer kept.sig");
    expect(sentInit(fetch).credentials).toBe("omit");
  });

  it("shell: a 401 drops the dead token (memory and storage)", async () => {
    const store = memoryStore("dead.sig");
    resetSessionTransport({ mode: "bearer", store });
    await sessionReady();
    fetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await apiFetch("/api/notes");
    await vi.waitFor(() => expect(store.value()).toBeNull());
    expect(sessionToken()).toBeNull();
  });

  it("web: storage is never touched", async () => {
    const store = memoryStore("x");
    const get = vi.spyOn(store, "get");
    resetSessionTransport({ mode: "cookie", store });
    await sessionReady();
    await saveSessionToken("y");
    await clearSessionToken();
    expect(get).not.toHaveBeenCalled();
    expect(store.value()).toBe("x");
  });

  it("shell: unreadable storage starts signed out instead of failing launch", async () => {
    const store = memoryStore();
    store.get = () => Promise.reject(new Error("keychain locked"));
    resetSessionTransport({ mode: "bearer", store });
    await expect(sessionReady()).resolves.toBeUndefined();
    expect(sessionToken()).toBeNull();
  });
});

describe("authFetchOptions (Better Auth client)", () => {
  afterEach(() => resetSessionTransport());

  it("web: no options — the client's default cookie requests", () => {
    resetSessionTransport({ mode: "cookie" });
    expect(authFetchOptions()).toBeUndefined();
  });

  it("shell: omits cookies, sends the current token, keeps a sign-in's new token", async () => {
    const store = memoryStore();
    resetSessionTransport({ mode: "bearer", store });
    const options = authFetchOptions()!;
    expect(options.credentials).toBe("omit");
    expect(options.auth.token()).toBeUndefined();
    await options.onResponse({ request: { url: "https://biblestdy.com/api/auth/sign-in/email-otp" } });
    await options.onSuccess({ response: new Response("{}", { headers: { "set-auth-token": "new.sig" } }) });
    expect(options.auth.token()).toBe("new.sig");
    expect(store.value()).toBe("new.sig");
  });

  it("shell: sign-out forgets the token", async () => {
    const store = memoryStore("old.sig");
    resetSessionTransport({ mode: "bearer", store, token: "old.sig" });
    const options = authFetchOptions()!;
    await options.onResponse({ request: { url: new URL("https://biblestdy.com/api/auth/sign-out") } });
    expect(options.auth.token()).toBeUndefined();
    expect(store.value()).toBeNull();
  });
});

describe("sessionReady never blocks launch", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetSessionTransport();
  });

  it("a Keychain read that never answers starts signed out after a moment", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    store.get = () => new Promise<string | null>(() => undefined);
    resetSessionTransport({ mode: "bearer", store });
    const ready = sessionReady();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(ready).resolves.toBeUndefined();
    expect(sessionToken()).toBeNull();
  });
});
