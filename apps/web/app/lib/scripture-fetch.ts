import { redirect } from "react-router";
import { currentPath, signinHref } from "./next-path";
import { apiFetch } from "./session-transport";

/** Fetch a scripture endpoint. The API only serves text to signed-in sessions
 * (#26), so a 401 means the session expired mid-use: send the reader to
 * sign-in — and back to `next` afterwards (default: the page they're on) —
 * instead of showing a generic load error. Other statuses are the caller's.
 * Same transport as api() (lib/session-transport). */
export async function fetchScripture(url: string, next: string = currentPath(), headers?: Record<string, string>): Promise<Response> {
  const res = await apiFetch(url, headers && { headers });
  if (res.status === 401) throw redirect(signinHref(next));
  return res;
}
