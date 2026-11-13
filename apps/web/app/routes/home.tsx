import { redirect } from "react-router";
import { Landing } from "~/landing/landing";
import { isNativeShell } from "~/lib/api-base";
import { authClient } from "~/lib/auth-client";
import i18n from "~/lib/i18n";
import { lastReadHref } from "../reader/chapter-nav";

export function meta() {
  return [
    { title: i18n.t("landing.metaTitle") },
    { name: "description", content: i18n.t("landing.metaDescription") },
  ];
}

/** Installed PWA / native shell: an app, not a website — skip the pitch. */
function isAppShell(): boolean {
  if (isNativeShell()) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

// Signed in: the app IS the reader — land wherever the reader last was. This
// is also what makes the installed PWA (start_url "/") open on the page you
// were reading. Signed out on the web: the marketing page; in the app shell:
// straight to sign-in.
export async function clientLoader() {
  const { data } = await authClient.getSession().catch(() => ({ data: null }));
  if (data?.session) {
    const last = typeof localStorage !== "undefined" ? localStorage.getItem("lastRead") : null;
    // lastRead keeps the page too (#52): "JHN/3?p=2" reopens on page 2
    return redirect(lastReadHref(last) ?? "/read/JHN/3");
  }
  if (isAppShell()) return redirect("/signin");
  return null;
}

export default function Home() {
  return <Landing />;
}
