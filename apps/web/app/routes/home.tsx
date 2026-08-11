import { redirect } from "react-router";
import { requireAuth } from "~/lib/require-auth";

// The app IS the reader; land in Scripture (auth required) — wherever the
// reader last was. This is also what makes the installed PWA (start_url "/")
// open on the page you were reading, including the one you installed from.
export async function clientLoader() {
  await requireAuth();
  const last = typeof localStorage !== "undefined" ? localStorage.getItem("lastRead") : null;
  return redirect(/^[A-Z0-9]{3}\/\d+$/.test(last ?? "") ? `/read/${last}` : "/read/JHN/3");
}

export default function Home() {
  return null;
}
