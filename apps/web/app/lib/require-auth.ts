import { redirect } from "react-router";
import { authClient } from "./auth-client";
import { signinHref } from "./next-path";
import { pruneDrafts, setDraftUser } from "./note-drafts";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

/** A loader request's app path (path + query): where sign-in returns to. */
export function pathOf(url: string): string {
  const { pathname, search } = new URL(url);
  return pathname + search;
}

/** Call at the top of a protected route's clientLoader. Redirects to
 * /signin when unauthed — with `next` (the page being opened), so sign-in
 * comes back to it.
 * `cached` (the reader only): a session the client already holds (the store
 * useSession reads; sign-out clears it) skips the round trip, so a chapter
 * turn renders at once — an expired one still ends at /signin through the
 * API's 401 (scripture-fetch, api()), which other pages don't have. */
export async function requireAuth({
  cached = false,
  next,
}: { cached?: boolean; next?: string } = {}): Promise<SessionData> {
  const known = authClient.$store.atoms.session?.get() as
    | { data: SessionData | null; isPending: boolean }
    | undefined;
  if (cached && known && !known.isPending && known.data?.session) return signedIn(known.data);
  const { data } = await authClient.getSession();
  if (!data?.session) throw redirect(next ? signinHref(next) : "/signin");
  return signedIn(data);
}

/** Unsaved note drafts (lib/note-drafts) are this user's; old ones go. */
function signedIn(data: SessionData): SessionData {
  setDraftUser(data.user.id);
  pruneDrafts();
  return data;
}

/** For /signin: bounce already-authed users on — to `next` (sanitised by
 * the caller) or the reader. */
export async function redirectIfAuthed(next = "/") {
  const { data } = await authClient.getSession();
  if (data?.session) throw redirect(next);
}
