import { redirect } from "react-router";
import { requireAuth } from "~/lib/require-auth";
import { lastReadHref } from "../reader/chapter-nav";

// The app IS the reader; land in Scripture (auth required) — wherever the
// reader last was. This is also what makes the installed PWA (start_url "/")
// open on the page you were reading, including the one you installed from.
export async function clientLoader() {
  await requireAuth();
  const last = typeof localStorage !== "undefined" ? localStorage.getItem("lastRead") : null;
  // lastRead keeps the page too (#52): "JHN/3?p=2" reopens on page 2
  return redirect(lastReadHref(last) ?? "/read/JHN/3");
}

export default function Home() {
  return null;
}
