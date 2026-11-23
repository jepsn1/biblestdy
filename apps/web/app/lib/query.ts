import { QueryClient } from "@tanstack/react-query";

import { currentPath, signinHref } from "./next-path";
import { apiFetch } from "./session-transport";

/** A non-2xx API answer: the status (401 = signed out, 4xx = the request,
 * 5xx = the server) and the parsed body (JSON, else text, else null). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The response as an ApiError (body parsed best-effort). */
export async function apiError(res: Response, label: string): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  let body: unknown = text || null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON: keep the text
  }
  return new ApiError(res.status, body, `${label} -> ${res.status}`);
}

/** Retry a failed query once — unless the request itself was refused (4xx:
 * asking again gets the same answer, and a 401 is already off to sign-in). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

let leaving = false;
/** Sign-in bounces this tab made lately (sessionStorage: survives the loads). */
const BOUNCES_KEY = "signinBounces";
const MAX_BOUNCES = 3;

/** True when this tab was already sent to sign-in MAX_BOUNCES times in the
 * last minute: signed in, yet the API keeps saying 401 (a cookie the API
 * never sees) — stop bouncing and let the page show its errors instead. */
export function bouncingInLoop(now = Date.now()): boolean {
  try {
    const recent = (JSON.parse(sessionStorage.getItem(BOUNCES_KEY) ?? "[]") as number[]).filter(
      (t) => t > now - 60_000,
    );
    if (recent.length >= MAX_BOUNCES) return true;
    sessionStorage.setItem(BOUNCES_KEY, JSON.stringify([...recent, now]));
  } catch {
    // storage blocked: no breaker, the redirect still helps
  }
  return false;
}

/** The session ended mid-use (an API call answered 401): sign in again and
 * come back to this page (with an open note: lib/note-drafts keeps its
 * unsaved text). A full load, so nothing of the old session — the query
 * cache, the auth client's cached session — survives into the new one.
 * Once: a page's parallel calls all 401 together. */
export function sessionExpired() {
  if (leaving || typeof window === "undefined") return;
  if (window.location.pathname === "/signin") return;
  if (bouncingInLoop()) return;
  leaving = true;
  window.location.assign(signinHref(currentPath()));
}

/** App-wide query client. Annotation data is per-user and only mutated from
 * this device, so a modest staleTime saves refetches when flipping between
 * chapters; mutations keep the cache correct via setQueryData. A failed load
 * stays an error — never cached as "nothing" — so the reader can say so. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});

/** Fetch JSON with the session (cookie on the web, bearer in the shell —
 * lib/session-transport); throws an ApiError on non-2xx. A 401
 * also sends the reader to sign-in (sessionExpired) — loads and saves alike:
 * the app's writes are plain calls, not useMutation, so a query-cache hook
 * alone would miss a session that expired during a save. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) {
    if (res.status === 401) sessionExpired();
    throw await apiError(res, `${init?.method ?? "GET"} ${url}`);
  }
  return res.json() as Promise<T>;
}

/** Add to (or change) a cached list — unless the list never loaded (a failed
 * or pending load): then fetch it fresh, which brings the new row too.
 * Writing into a list that isn't there would cache "just this one" as all
 * there is, and hide the load error that says otherwise. */
export function updateList<T>(qc: QueryClient, key: readonly unknown[], update: (list: T[]) => T[]) {
  if (qc.getQueryState(key)?.status !== "success") {
    void qc.invalidateQueries({ queryKey: key, exact: true });
    return;
  }
  qc.setQueryData<T[]>(key, (list = []) => update(list));
}
