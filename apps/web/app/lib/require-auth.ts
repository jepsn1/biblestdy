import { redirect } from "react-router";
import { authClient } from "./auth-client";

/** Call at the top of a protected route's clientLoader. Redirects to /signin when unauthed. */
export async function requireAuth() {
  const { data } = await authClient.getSession();
  if (!data?.session) throw redirect("/signin");
  return data;
}

/** For /signin: bounce already-authed users to the reader. */
export async function redirectIfAuthed() {
  const { data } = await authClient.getSession();
  if (data?.session) throw redirect("/");
}
