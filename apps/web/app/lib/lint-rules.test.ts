import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Design-system lint rules (#68, from #61): text colour tokens pass AA on
 * their background, so no opacity modifier on them; no arbitrary font size
 * below 12px. Rules live in eslint.config.js — this pins what they catch.
 */
const eslint = new ESLint({ cwd: fileURLToPath(new URL("../..", import.meta.url)) });

async function hits(className: string) {
  const [result] = await eslint.lintText(`export const c = "${className}";\n`, {
    filePath: "app/lint-sample.tsx",
  });
  return result.messages.map((m) => m.ruleId);
}

describe("design-system lint rules", () => {
  it("flags faded text tokens, not other opacity use", async () => {
    expect(await hits("text-primary/80 placeholder:text-muted-foreground/60")).toEqual([
      "biblestdy/no-faded-text",
      "biblestdy/no-faded-text",
    ]);
    expect(await hits("bg-primary/15 border-primary/50 ring-foreground/40 text-xs")).toEqual([]);
  });

  it("flags arbitrary sizes below 12px, not 12px+ or em", async () => {
    expect(await hits("text-[0.65rem] md:text-[11px]")).toEqual([
      "biblestdy/no-small-text",
      "biblestdy/no-small-text",
    ]);
    expect(await hits("text-[0.75rem] text-[12px] text-[0.8rem] text-[0.58em] text-xs")).toEqual([]);
  });

  it("checks template literals too", async () => {
    const [result] = await eslint.lintText("export const c = `a ${1} text-foreground/70`;\n", {
      filePath: "app/lint-sample.tsx",
    });
    expect(result.messages.map((m) => m.ruleId)).toEqual(["biblestdy/no-faded-text"]);
  });
});
