import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every .tsx under app/ but the drawer itself. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".tsx") && !p.endsWith("components/ui/drawer.tsx") ? [p] : [];
  });
}
const app = join(import.meta.dirname, "../..");
const drawer = readFileSync(join(import.meta.dirname, "drawer.tsx"), "utf8");

describe("one drawer for all drawers (#283)", () => {
  it("one backdrop: 20 % light, 40 % dark, no blur, nested drawers too", () => {
    expect(drawer).toMatch(/bg-black\/20 dark:bg-black\/40/);
    expect(drawer).not.toMatch(/backdrop-blur/);
    expect(drawer).toMatch(/<DrawerOverlay[^>]*forceRender \/>/);
  });
  it("no drawer overrides the backdrop, blur or edge", () => {
    const offenders = sources(app).filter((f) => {
      const s = readFileSync(f, "utf8");
      return /overlayClassName|overlay="force"|backdrop-blur-none/.test(s) || (/DrawerContent/.test(s) && /shadow-\[0_-6px/.test(s));
    });
    expect(offenders).toEqual([]);
  });
  it("a drawer mounted open still slides in (opens a render after mount)", () => {
    expect(drawer).toMatch(/open=\{open === undefined \? undefined : mounted && open\}/);
  });
  it("the chip's drawer stays mounted until it has slid away", () => {
    const chip = readFileSync(join(app, "reader/scripture-chip.tsx"), "utf8");
    expect(chip).toContain("<Drawer open={open} onOpenChange={(o) => !o && onClose(true)} onOpenChangeComplete={(o) => !o && onClosed()}");
  });
});
