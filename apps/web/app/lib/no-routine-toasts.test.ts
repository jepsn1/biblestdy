import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard for #257: a plain `toast(…)` (not `toast.error`) is only for Undo
 * after a delete, and the one prompt that needs a choice. Routine
 * success/info goes to lib/announce — read out, never shown. A new plain
 * toast means adding its file here, with the reason.
 */
const ALLOWED: Record<string, string> = {
  "lib/notify.ts": "notifyUndo (deletes) + the copy-limit refusal",
  "reader/ref-removal.tsx": "reference removed from a note · Undo",
  "reader/references-overview.tsx": "reference removed from a note · Undo",
  "reader/note-panel.tsx": "reference removed · Undo; draft from another device · Restore/Discard",
  "palette/command-palette.tsx": "“Ryd” recent chapters · Undo",
};

const root = fileURLToPath(new URL("..", import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) return sources(rel);
    return /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [rel] : [];
  });
}

describe("no routine toasts (#257)", () => {
  const plain = sources("").filter(
    (f) => f !== "lib/toast.ts" && !f.startsWith("components/ui/") && /\btoast\(/.test(readFileSync(join(root, f), "utf8")),
  );

  it("plain toasts only where an Undo or a choice needs one", () => {
    expect(plain.filter((f) => !(f in ALLOWED))).toEqual([]);
  });

  it("the allow-list has no stale entries", () => {
    expect(Object.keys(ALLOWED).filter((f) => !plain.includes(f))).toEqual([]);
  });
});
