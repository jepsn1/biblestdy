import * as MDX from "@mdxeditor/editor";
import { linkPlugin, markdown$, Realm, rootEditor$ } from "@mdxeditor/editor";
import { $getRoot, $isParagraphNode, type LexicalEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
  $insertScriptureRef,
  $isScriptureRefNode,
  $restoreSelection,
  saveSelection,
  scriptureRefPlugin,
} from "./scripture-ref-node";

/** A headless MDXEditor (no DOM): the realm with the plugins the note uses. */
function editorWith(markdown: string) {
  const realm = new Realm();
  const plugins = [
    // corePlugin isn't in MDXEditor's typings, but is its first plugin
    ((MDX as unknown as Record<string, (p: object) => { init: (r: Realm) => void; postInit: (r: Realm) => void }>).corePlugin)({
      initialMarkdown: markdown,
      trim: true,
      onChange: () => {},
      onBlur: () => {},
      onError: (e: unknown) => {
        throw e;
      },
      toMarkdownOptions: { listItemIndent: "one" },
      translation: (_k: string, d: string) => d,
      iconComponentFor: () => null,
      placeholder: "",
      contentEditableClassName: "",
      suppressHtmlProcessing: false,
      additionalLexicalNodes: [],
    }),
    scriptureRefPlugin(),
    linkPlugin(),
  ];
  for (const p of plugins) p.init?.(realm);
  for (const p of plugins) p.postInit?.(realm);
  const editor = realm.getValue(rootEditor$) as LexicalEditor;
  return { realm, editor, markdown: () => realm.getValue(markdown$) };
}

/** Lets Lexical's queued update commit. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function chips(editor: LexicalEditor): { href: string; text: string }[] {
  return editor.getEditorState().read(() => {
    const out: { href: string; text: string }[] = [];
    for (const block of $getRoot().getChildren()) {
      if (!$isParagraphNode(block)) continue;
      for (const n of block.getChildren()) if ($isScriptureRefNode(n)) out.push({ href: n.getHref(), text: n.getTextContent() });
    }
    return out;
  });
}

const BODY = [
  "Moses lifted the serpent ([Num 21,4–9](bible:NUM.21.4-9)); so must the Son of Man be lifted up — [Joh 3,14–15](bible:JHN.3.14-15).",
  "",
  "*God so loved* the world: [John 3:16](bible:JHN.3.16) and see [Isa 52:13–53:12](bible:ISA.52.13-53.12).",
].join("\n");

describe("ScriptureRefNode: markdown round-trip", () => {
  it("imports `bible:` links as chips (not blanked links)", async () => {
    const { editor } = editorWith(BODY);
    await settle();
    expect(chips(editor)).toEqual([
      { href: "bible:NUM.21.4-9", text: "Num 21,4–9" },
      { href: "bible:JHN.3.14-15", text: "Joh 3,14–15" },
      { href: "bible:JHN.3.16", text: "John 3:16" },
      { href: "bible:ISA.52.13-53.12", text: "Isa 52:13–53:12" },
    ]);
  });

  it("exports the body byte for byte", async () => {
    const { markdown } = editorWith(BODY);
    await settle();
    expect(markdown().trim()).toBe(BODY);
  });

  it("leaves other links (and malformed bible: ones) as links", async () => {
    const body = "See [the site](https://example.com) and [odd](bible:XYZ.1.1).";
    const { editor, markdown } = editorWith(body);
    await settle();
    expect(chips(editor)).toEqual([]);
    expect(markdown().trim()).toContain("[the site](https://example.com)");
  });

  it("serializes to JSON and back (copy/paste)", async () => {
    const { editor } = editorWith("[Joh 3,16](bible:JHN.3.16)");
    await settle();
    const json = editor.getEditorState().toJSON();
    const again = editor.parseEditorState(json);
    const found = again.read(() =>
      $getRoot()
        .getAllTextNodes()
        .map((n) => n.getTextContent()),
    );
    expect(JSON.stringify(json)).toContain('"href":"bible:JHN.3.16"');
    expect(found).toEqual([]);
    expect(again.read(() => $getRoot().getTextContent())).toBe("Joh 3,16");
  });
});

describe("inserting a chip at a saved selection", () => {
  it("lands where the caret was, even after the selection moved away", async () => {
    const { editor, markdown } = editorWith("Grace and peace.");
    await settle();
    // Caret after "Grace" (as when the toolbar button is pressed)
    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0];
      text.select(5, 5);
    });
    await settle();
    const saved = saveSelection(editor);
    // Focus leaves (dialog): the editor's selection goes
    editor.update(() => $getRoot().selectStart());
    await settle();
    editor.update(() => {
      $restoreSelection(saved);
      $insertScriptureRef("bible:ROM.1.7", "Rom 1,7");
    });
    await settle();
    expect(markdown().trim()).toBe("Grace[Rom 1,7](bible:ROM.1.7) and peace.");
  });

  it("goes to the end of the note with no selection", async () => {
    const { editor, markdown } = editorWith("Grace");
    await settle();
    editor.update(() => {
      $restoreSelection(null);
      $insertScriptureRef("bible:ROM.1.7", "Rom 1,7");
    });
    await settle();
    expect(markdown().trim()).toBe("Grace[Rom 1,7](bible:ROM.1.7)");
  });

  it("before a word, a space separates them", async () => {
    const { editor, markdown } = editorWith("See it");
    await settle();
    editor.update(() => $getRoot().getAllTextNodes()[0].select(4, 4));
    editor.update(() => $insertScriptureRef("bible:ROM.1.7", "Rom 1,7"));
    await settle();
    expect(markdown().trim()).toBe("See [Rom 1,7](bible:ROM.1.7) it");
  });

  it("a saved selection whose text is gone falls back to the end", async () => {
    const { editor, markdown } = editorWith("One\n\nTwo");
    await settle();
    editor.update(() => $getRoot().getAllTextNodes()[0].select(3, 3));
    await settle();
    const saved = saveSelection(editor);
    editor.update(() => $getRoot().getFirstChild()?.remove());
    await settle();
    editor.update(() => {
      $restoreSelection(saved);
      $insertScriptureRef("bible:PSA.23", "Sl 23");
    });
    await settle();
    expect(markdown().trim()).toBe("Two[Sl 23](bible:PSA.23)");
  });
});
