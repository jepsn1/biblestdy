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

/** "" on the web (same-origin), the prod origin inside the shell. */
export const apiBase = isNativeShell() ? "https://biblestdy.com" : "";

/** Prefix an app-relative `/api/...` path with the runtime API base. */
export function apiUrl(path: string): string {
  return apiBase + path;
}
