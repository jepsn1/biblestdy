import { redirect } from "react-router";
import { authClient } from "./auth-client";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

/** Call at the top of a protected route's clientLoader. Redirects to /signin when unauthed.
 * A session the client already holds (the store useSession reads; sign-out
 * clears it) skips the round trip, so a chapter turn renders at once — an
 * expired one still ends at /signin through the API's 401 (scripture-fetch). */
export async function requireAuth(): Promise<SessionData> {
  const known = authClient.$store.atoms.session?.get() as
    | { data: SessionData | null; isPending: boolean }
    | undefined;
  if (known && !known.isPending && known.data?.session) return known.data;
  const { data } = await authClient.getSession();
  if (!data?.session) throw redirect("/signin");
  return data;
}

/** For /signin: bounce already-authed users to the reader. */
export async function redirectIfAuthed() {
  const { data } = await authClient.getSession();
  if (data?.session) throw redirect("/");
}
