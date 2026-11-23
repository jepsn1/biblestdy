import { apiUrl, isNativeShell } from "./api-base";

/**
 * Session transport seam (#18). Every API call — api(), scripture fetches,
 * FUMS reports and the Better Auth client — goes through here.
 *
 * - cookie (the web): same-origin, `credentials: "include"`, the HttpOnly
 *   session cookie. Exactly what the web always sent.
 * - bearer (the Capacitor shell): the app runs on capacitor://localhost and
 *   calls https://biblestdy.com cross-origin, where WKWebView treats the
 *   session cookie as third-party and drops it. So the session token (the
 *   API hands it out in `set-auth-token` on sign-in, to shell origins only)
 *   lives in the Keychain / Android Keystore and goes out as
 *   `Authorization: Bearer …`, with cookies off (`credentials: "omit"`).
 *
 * The token is never put in a URL and never logged.
 */
export type Transport = "cookie" | "bearer";

let mode: Transport = isNativeShell() ? "bearer" : "cookie";

/** This runtime's transport: bearer in the native shell, else cookie. */
export function currentTransport(): Transport {
  return mode;
}

/** Pure: the fetch options for an API call in `mode` with `token`. */
export function withSession(init: RequestInit | undefined, mode: Transport, token: string | null): RequestInit {
  if (mode === "cookie") return { credentials: "include", ...init };
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, credentials: "omit", headers };
}

/** Where the shell keeps the token. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
}

const KEY = "session-token";

/** Keychain (iOS) / Keystore (Android) via @aparajita/capacitor-secure-storage,
 * loaded only in the shell, so the web bundle never carries it. This
 * device only (not in backups), readable while unlocked. */
function secureStore(): TokenStore {
  const plugin = import("@aparajita/capacitor-secure-storage").then(async (m) => {
    await m.SecureStorage.setDefaultKeychainAccess(m.KeychainAccess.whenUnlockedThisDeviceOnly);
    return m.SecureStorage;
  });
  return {
    get: async () => (await plugin).getItem(KEY),
    set: async (token) => (await plugin).setItem(KEY, token),
    remove: async () => (await plugin).removeItem(KEY),
  };
}

let store: TokenStore | null = null;
let token: string | null = null;
let ready: Promise<void> | null = null;

const tokenStore = () => (store ??= secureStore());

/** Load the stored token (shell only; the web resolves at once). The app
 * waits for this before its first render (entry.client), so the first
 * loader's session check already carries it — a restart stays signed in. */
export function sessionReady(): Promise<void> {
  if (mode !== "bearer") return Promise.resolve();
  return (ready ??= tokenStore()
    .get()
    .then((t) => {
      token = t || null;
    })
    .catch(() => {
      // Storage unreadable: start signed out rather than not at all
      token = null;
    }));
}

export function sessionToken(): string | null {
  return token;
}

/** A sign-in handed us a token: keep it (memory now, secure storage for
 * the next launch). */
export async function saveSessionToken(next: string): Promise<void> {
  if (mode !== "bearer" || !next || next === token) return;
  token = next;
  await tokenStore()
    .set(next)
    .catch(() => {
      // Not persisted: this launch stays signed in, the next asks again
    });
}

/** Signed out, or the API no longer knows the session (401). */
export async function clearSessionToken(): Promise<void> {
  if (mode !== "bearer") return;
  token = null;
  await tokenStore()
    .remove()
    .catch(() => undefined);
}

/** fetch() for an `/api/...` path: the runtime API base plus this
 * transport's session. A 401 in the shell drops the dead token. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), withSession(init, mode, token));
  if (res.status === 401 && mode === "bearer" && token) void clearSessionToken();
  return res;
}

/** Better Auth client options for this transport (lib/auth-client): none
 * on the web; in the shell the bearer header, no cookies, and the token
 * captured from sign-in / dropped at sign-out. */
export function authFetchOptions() {
  if (mode !== "bearer") return undefined;
  return {
    credentials: "omit" as const,
    auth: { type: "Bearer" as const, token: () => token ?? undefined },
    onSuccess: (ctx: { response: Response }) => {
      const next = ctx.response.headers.get("set-auth-token");
      if (next) return saveSessionToken(next);
    },
    // Any answer to a sign-out (even "no such session", after deleting the
    // account) ends this token; no answer (offline) keeps it, as on the web
    onResponse: (ctx: { request: { url: string | URL } }) => {
      if (String(ctx.request.url).endsWith("/sign-out")) return clearSessionToken();
    },
  };
}

/** Tests only. */
export function resetSessionTransport(
  next: { mode?: Transport; store?: TokenStore | null; token?: string | null } = {},
) {
  mode = next.mode ?? (isNativeShell() ? "bearer" : "cookie");
  store = next.store ?? null;
  token = next.token ?? null;
  ready = null;
}
