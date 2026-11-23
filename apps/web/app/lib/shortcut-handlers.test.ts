import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drift guard (#145): every page-wide keydown listener goes through
 * ~/lib/shortcuts (ignoreShortcut / singleKeyOff / opens…), so the
 * single-key switch can't miss a new one. Listeners that never act on a
 * character key are listed with why.
 */
const NO_CHARACTER_KEYS: Record<string, string> = {
  "palette/lazy-palette.tsx": "Esc only, while the palette chunk loads",
  "palette/open-palette.ts": "typeahead into the palette that's opening — typing, not a shortcut",
  "reader/account-settings.tsx": "Esc only, while the settings are open",
  "reader/spotlight.ts": "Esc only, while a reference spotlight shows (#190)",
  "reader/ref-bridge.tsx": "Esc only, while an overview chip is tinted (#190)",
  "notes/notes-tour.tsx": "Esc and Tab only, while a tour card shows; other keys just note that someone's typing",
  "lib/notices.ts": "Ctrl/Cmd+Z only (a mod chord, never a lone character): runs the visible Undo (#257)",
  "lib/ota-native.ts": "acts on no key: only notes that someone is using the app, so an OTA switch waits (#19)",
};

const root = fileURLToPath(new URL("..", import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sources(p);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

describe("global key handlers", () => {
  const globalListeners = sources(root)
    .map((p) => ({ file: relative(root, p), src: readFileSync(p, "utf8") }))
    .filter(({ src }) => /(window|document)\.addEventListener\("keydown"/.test(src));

  it("finds the reader's handlers (the scan itself works)", () => {
    expect(globalListeners.map((f) => f.file)).toEqual(
      expect.arrayContaining(["reader/paginated-chapter.tsx", "reader/chapter-text.tsx", "routes/read.tsx"]),
    );
  });

  it("each one asks ~/lib/shortcuts, or is listed as never acting on a character key", () => {
    const unguarded = globalListeners
      .filter(({ file, src }) => !(file in NO_CHARACTER_KEYS) && !/from "~\/lib\/shortcuts"/.test(src))
      .map((f) => f.file);
    expect(unguarded).toEqual([]);
  });
});
