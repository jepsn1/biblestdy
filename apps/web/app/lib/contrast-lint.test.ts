import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrast lint (#61): text colour tokens are tuned to ≥ 4.5:1 on their
 * background — an opacity modifier (`text-primary/80`,
 * `text-muted-foreground/70`) silently drops them below AA. Use the token
 * itself, or add a new token that passes.
 */
const APP = fileURLToPath(new URL("..", import.meta.url));
const TEXT_TOKENS =
  "foreground|muted-foreground|primary|primary-foreground|secondary-foreground|accent-foreground|card-foreground|popover-foreground|destructive|sidebar-foreground|sidebar-primary|sidebar-accent-foreground";
const FADED_TEXT = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*text-(?:${TEXT_TOKENS})/\\d+`, "g");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("contrast lint (#61)", () => {
  it("the pattern catches faded text tokens, not other opacity use", () => {
    const hits = (s: string) => s.match(FADED_TEXT) ?? [];
    expect(hits("text-primary/80 placeholder:text-muted-foreground/60")).toHaveLength(2);
    expect(hits("bg-primary/15 border-primary/50 ring-foreground/40 text-xs")).toHaveLength(0);
    expect(hits("hover:text-foreground text-[0.65rem]")).toHaveLength(0);
  });

  it("no source file fades a text colour token with an opacity modifier", () => {
    const offenders = sources(APP).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          (line.match(FADED_TEXT) ?? []).map((m) => `${relative(APP, file)}:${i + 1} ${m}`),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
