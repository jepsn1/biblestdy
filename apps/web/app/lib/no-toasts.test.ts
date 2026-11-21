import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard for #257: no toasts, on any screen. Errors and Undo show inline next
 * to the action (lib/notices + components/inline-notice); routine success is
 * read out (lib/announce). A toast library coming back fails here.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) return sources(rel);
    return /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [rel] : [];
  });
}

describe("no toasts (#257)", () => {
  it("nothing imports a toast library or the old toast shim", () => {
    const hits = sources("").filter((f) => /from ["'](sonner|~\/lib\/toast|\.\/toast|react-hot-toast)["']/.test(readFileSync(join(root, f), "utf8")));
    expect(hits).toEqual([]);
  });

  it("the web app doesn't depend on one", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).filter((d) => /toast|sonner/.test(d))).toEqual([]);
  });
});
