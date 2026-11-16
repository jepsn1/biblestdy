import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { stillLayerName, TURN_STILL } from "./turn-still";

/**
 * Guard for "only the page moves" (turn-still.ts): reads the reader's own
 * source, as a tree, so chrome can't drift back into a sliding element.
 * Chrome = these components; the page = the text column and its word ink.
 */
const CHROME = ["ChapterStrip", "PageFoot", "MarksLoadError", "ToolPalette", "ToolStatus", "ColourKey"];
/** Chrome that names itself a still layer (its own root element). */
const SELF_STILL: Record<string, { file: string; name: string }> = {
  ChapterStrip: { file: "./chapter-strip.tsx", name: "strip" },
  PageFoot: { file: "./page-foot.tsx", name: "foot" },
};

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const parse = (file: string) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

type El = ts.JsxElement | ts.JsxSelfClosingElement;
const opening = (el: El) => (ts.isJsxElement(el) ? el.openingElement : el);
const tag = (el: El) => opening(el).tagName.getText();
const attrs = (el: El) => opening(el).attributes.properties;
const attr = (el: El, name: string) =>
  attrs(el).find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name);
/** The still layer this element names itself, if any ({...turnStill("x")}). */
const stillOf = (el: El) => {
  for (const a of attrs(el)) {
    const m = ts.isJsxSpreadAttribute(a) && /turnStill\("([\w-]+)"\)/.exec(a.expression.getText());
    if (m) return m[1];
  }
  return null;
};
function elements(root: ts.Node): El[] {
  const out: El[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
    n.forEachChild(walk);
  };
  walk(root);
  return out;
}
/** JSX elements between `el` and `root` (exclusive of root). */
function ancestors(el: ts.Node, root: ts.Node): El[] {
  const out: El[] = [];
  for (let n = el.parent; n && n !== root; n = n.parent) {
    if (ts.isJsxElement(n)) out.push(n);
  }
  return out;
}

const reader = parse("./paginated-chapter.tsx");
const all = elements(reader);

describe("page turns move only the page", () => {
  it("no chrome inside the text column (the in-chapter slide)", () => {
    const columns = all.filter((el) => attr(el, "ref")?.initializer?.getText() === "{contentRef}");
    expect(columns.length).toBe(2); // phone + paged
    for (const column of columns) {
      const inside = elements(column).map(tag);
      for (const name of CHROME) expect(inside, `${name} in the sliding text column`).not.toContain(name);
    }
  });

  it("chrome inside the paged sheet (the crossing's layer) is a still layer", () => {
    const sheet = all.find((el) => attr(el, "data-chapter-sheet") && tag(el) === "div");
    expect(sheet).toBeDefined();
    const chrome = elements(sheet!).filter((el) => CHROME.includes(tag(el)));
    expect(chrome.map(tag)).toEqual(expect.arrayContaining(["ChapterStrip", "PageFoot", "MarksLoadError"]));
    for (const el of chrome) {
      const self = SELF_STILL[tag(el)];
      const still = self ? self.name : [el, ...ancestors(el, sheet!)].map(stillOf).find(Boolean);
      expect(still, `${tag(el)} slides with the sheet`).toBeTruthy();
    }
  });

  it("self-still chrome names itself on its root element", () => {
    for (const [component, { file, name }] of Object.entries(SELF_STILL)) {
      const roots = elements(parse(file)).filter((el) => stillOf(el) === name);
      expect(roots.length, `${component} lost turnStill("${name}")`).toBe(1);
    }
  });

  it("still-layer names are unique (a duplicate cancels the slide)", () => {
    const used = [...all.map(stillOf), ...Object.values(SELF_STILL).map((s) => s.name)].filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it("app.css lifts every still layer out of the slide, unanimated", () => {
    const css = read("../app.css");
    const inCss = [...css.matchAll(/\[data-turn-still="([\w-]+)"\]/g)].map((m) => m[1]);
    expect([...inCss].sort()).toEqual([...TURN_STILL].sort());
    for (const name of TURN_STILL) {
      const vt = stillLayerName(name);
      const esc = vt.replace(/-/g, "\\-");
      expect(css).toMatch(new RegExp(`\\[data-turn-still="${name}"\\] \\{\\s*view-transition-name: ${esc};`));
      for (const part of ["group", "new", "old"]) {
        expect(css, `::view-transition-${part}(${vt})`).toContain(`::view-transition-${part}(${vt})`);
      }
    }
  });
});
