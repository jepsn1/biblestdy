/**
 * API base seam. The SPA calls same-origin `/api`, but inside the Capacitor
 * shell the origin is capacitor://localhost, so same-origin breaks. When
 * running native the app targets production instead. This is only the URL
 * seam; the session goes with it in lib/session-transport (bearer in the
 * shell, #18) — the API allows the shell's origins by CORS
 * (apps/api/src/http/shell-cors.ts).
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** The shell's API: always production (PRD #14 — no in-app switcher).
 * VITE_SHELL_API_ORIGIN overrides it at BUILD time only, for a local shell
 * build against a dev API (and the shell simulation in e2e/); never set it
 * for a release build. */
const SHELL_API = import.meta.env.VITE_SHELL_API_ORIGIN || "https://biblestdy.com";

/** "" on the web (same-origin), the prod origin inside the shell. */
export const apiBase = isNativeShell() ? SHELL_API : "";

/** Prefix an app-relative `/api/...` path with the runtime API base. */
export function apiUrl(path: string): string {
  return apiBase + path;
}
