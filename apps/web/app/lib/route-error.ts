import { isRouteErrorResponse } from "react-router";
import { ApiError } from "./query";

/**
 * What a route error means to the reader. The error pages show a
 * localized title per kind and never the router's own text ("No route
 * matches URL …" is developer English).
 * - offline: no connection, or a fetch/module load the network refused
 * - notFound: a 404 (unknown page, chapter the API doesn't have)
 * - limit: the reading quota (#29) — the loader already wrote the message
 * - unexpected: anything else
 * `detail` is a message one of our loaders threw (already localized), when
 * there is one.
 */
export type RouteErrorKind = "offline" | "notFound" | "limit" | "unexpected";

export type RouteErrorInfo = { kind: RouteErrorKind; detail?: string };

/** fetch() / import() rejections when the network is gone (Chrome, Firefox, Safari). */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed|importing a module script failed|dynamically imported module/i;

export function describeRouteError(error: unknown, online: boolean): RouteErrorInfo {
  if (isRouteErrorResponse(error)) {
    // `internal` = the router's own (e.g. no matching route): never shown
    const ours = !(error as { internal?: boolean }).internal;
    const detail = ours && typeof error.data === "string" && error.data ? error.data : undefined;
    if (error.status === 404) return { kind: "notFound", detail };
    if (error.status === 429) return { kind: "limit", detail };
    if (!online) return { kind: "offline" };
    return { kind: "unexpected", detail };
  }
  // An api() call a loader let through (#127): same meaning by status
  if (error instanceof ApiError) {
    if (error.status === 404) return { kind: "notFound" };
    if (error.status === 429) return { kind: "limit" };
    if (!online) return { kind: "offline" };
    return { kind: "unexpected" };
  }
  if (!online || (error instanceof TypeError && NETWORK_FAILURE.test(error.message))) {
    return { kind: "offline" };
  }
  return { kind: "unexpected" };
}
