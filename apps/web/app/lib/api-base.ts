/**
 * API base seam. The SPA calls same-origin `/api`, but inside the Capacitor
 * shell the origin is capacitor://localhost, so same-origin breaks. When
 * running native the app targets production instead. This is only the URL
 * seam — bearer-token session transport is issue #18, so cookie auth is
 * knowingly incomplete cross-origin in the shell for now.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean };

function isNativeShell(): boolean {
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
