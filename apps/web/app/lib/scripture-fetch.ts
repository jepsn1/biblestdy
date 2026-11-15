import { redirect } from "react-router";
import { apiUrl } from "./api-base";
import { currentPath, signinHref } from "./next-path";

/** Fetch a scripture endpoint. The API only serves text to signed-in sessions
 * (#26), so a 401 means the session expired mid-use: send the reader to
 * sign-in — and back to `next` afterwards (default: the page they're on) —
 * instead of showing a generic load error. Other statuses are the caller's.
 * Same transport as api(): the API base (native shell) and the session
 * cookie. */
export async function fetchScripture(url: string, next: string = currentPath()): Promise<Response> {
  const res = await fetch(apiUrl(url), { credentials: "include" });
  if (res.status === 401) throw redirect(signinHref(next));
  return res;
}
