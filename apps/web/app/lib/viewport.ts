import { useEffect } from "react";
import { useMatches } from "react-router";
import { isNativeShell } from "~/lib/api-base";

/** Public pages (landing, sign-in, privacy, 404) are websites: pinch-zoom
 * stays on (WCAG 1.4.4). This is also what the static index.html ships.
 * viewport-fit=cover (#251): the page runs under the status bar, home
 * indicator and landscape notch, and pads itself by the safe-area tokens
 * (app.css --safe-*) — without it every env(safe-area-inset-*) is 0. */
export const VIEWPORT_OPEN = "width=device-width, initial-scale=1, viewport-fit=cover";

/** App routes lock zoom: the reader is a fixed folio that manages its own
 * scale, and pinch-zoom fights page-flip + annotation drag gestures. Product
 * decision (2026-11-13 UI review, #61): enlarging text there is the in-app
 * Text size setting instead. */
export const VIEWPORT_LOCKED = `${VIEWPORT_OPEN}, maximum-scale=1, user-scalable=no`;

/** A route opts into the lock with `export const handle = zoomLockHandle`. */
export const zoomLockHandle = { zoomLock: true } as const;

type Match = { handle?: unknown };

function locks(handle: unknown): boolean {
  return typeof handle === "object" && handle !== null && "zoomLock" in handle && handle.zoomLock === true;
}

/** Inside the Capacitor shell everything is app, sign-in included: locked. */
export function viewportContent(matches: readonly Match[], native = false): string {
  return native || matches.some((m) => locks(m.handle)) ? VIEWPORT_LOCKED : VIEWPORT_OPEN;
}

/** Paths whose routes carry `zoomLockHandle` — only for the pre-paint script
 * below; the handle stays the source of truth once the router runs. */
export const LOCKED_PATH = /^\/(read|notes)(\/|$)/;

/** root.tsx inline script: lock before first paint on a direct load of an app
 * route or in the native shell, so there is no zoomable window before the
 * router's effect runs. */
export const VIEWPORT_PREPAINT = `try{var c=window.Capacitor;if(${LOCKED_PATH}.test(location.pathname)||(c&&c.isNativePlatform&&c.isNativePlatform()))document.querySelector('meta[name="viewport"]').setAttribute("content","${VIEWPORT_LOCKED}")}catch(e){}`;

/** Keeps the viewport meta in step with the current route, across SPA
 * navigations. Set imperatively (not via the rendered prop) so the
 * prerendered index.html and hydration agree. */
export function useViewportZoom() {
  const content = viewportContent(useMatches(), isNativeShell());
  useEffect(() => {
    document.querySelector('meta[name="viewport"]')?.setAttribute("content", content);
  }, [content]);
}
