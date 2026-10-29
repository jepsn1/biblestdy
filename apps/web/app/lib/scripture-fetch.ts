import { redirect } from "react-router";

/** Fetch a scripture endpoint. The API only serves text to signed-in sessions
 * (#26), so a 401 means the session expired mid-use: send the reader to sign-in
 * instead of showing a generic load error. Other statuses are the caller's. */
export async function fetchScripture(url: string): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 401) throw redirect("/signin");
  return res;
}
