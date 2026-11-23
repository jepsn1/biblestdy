import { data, UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";
import { describe, expect, it } from "vitest";
import { ApiError } from "./query";
import { describeRouteError } from "./route-error";

/** What a loader's `throw data(msg, { status })` reaches the boundary as. */
const thrown = (status: number, message: string) =>
  new ErrorResponseImpl(status, "", data(message, { status }).data);

describe("describeRouteError", () => {
  it("never passes on the router's own 404 text", () => {
    const routerOwn = new ErrorResponseImpl(404, "Not Found", 'Error: No route matches URL "/nope"', true);
    expect(describeRouteError(routerOwn, true)).toEqual({ kind: "notFound", detail: undefined });
  });

  it("keeps a loader's localized message", () => {
    expect(describeRouteError(thrown(404, "Dette kapitel er ikke tilgængeligt (endnu)."), true)).toEqual({
      kind: "notFound",
      detail: "Dette kapitel er ikke tilgængeligt (endnu).",
    });
    expect(describeRouteError(thrown(429, "Wait a minute"), true)).toEqual({ kind: "limit", detail: "Wait a minute" });
    expect(describeRouteError(thrown(502, "Could not load the chapter"), true)).toEqual({
      kind: "unexpected",
      detail: "Could not load the chapter",
    });
  });

  it("online, a fetch or module load with no answer is unreachable — not offline", () => {
    expect(describeRouteError(new TypeError("Failed to fetch"), true).kind).toBe("unreachable");
    expect(describeRouteError(new TypeError("NetworkError when attempting to fetch resource."), true).kind).toBe("unreachable");
    // Safari/WKWebView: what a CORS refusal looks like too (#18)
    expect(describeRouteError(new TypeError("Load failed"), true).kind).toBe("unreachable");
    expect(describeRouteError(new TypeError("Failed to fetch dynamically imported module: /x.js"), true).kind).toBe("unreachable");
  });

  it("the same failures with the device offline are offline", () => {
    expect(describeRouteError(new TypeError("Load failed"), false).kind).toBe("offline");
  });

  it("anything while the device is offline is offline (a 404 stays a 404)", () => {
    expect(describeRouteError(new Error("boom"), false).kind).toBe("offline");
    expect(describeRouteError(thrown(502, "x"), false).kind).toBe("offline");
    expect(describeRouteError(thrown(404, "x"), false).kind).toBe("notFound");
  });

  it("a code bug is unexpected, not offline", () => {
    expect(describeRouteError(new TypeError("x is undefined"), true)).toEqual({ kind: "unexpected" });
    expect(describeRouteError("weird", true)).toEqual({ kind: "unexpected" });
  });

  it("an api() error means the same by status (#127)", () => {
    const err = (status: number) => new ApiError(status, null, `GET /api/x → ${status}`);
    expect(describeRouteError(err(404), true)).toEqual({ kind: "notFound" });
    expect(describeRouteError(err(429), true)).toEqual({ kind: "limit" });
    expect(describeRouteError(err(500), true)).toEqual({ kind: "unexpected" });
    expect(describeRouteError(err(500), false)).toEqual({ kind: "offline" });
  });
});
