import {
  addActivePlugin$,
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type NodeRef,
} from "@mdxeditor/editor";
import { parseScriptureHref, type ScriptureRef } from "@biblestdy/shared";
import {
  $createNodeSelection,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  DecoratorNode,
  type BaseSelection,
  type DOMExportOutput,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { ReactNode } from "react";
import { ScriptureChip } from "./scripture-chip";
import { ScriptureRefKeys } from "./ref-keys";
import { RefRemovalToast } from "./ref-removal";
import { RefTypeahead } from "./ref-typeahead";

/**
 * An inline scripture reference in a note body (#160): `[Joh 3,16](bible:JHN.3.16)`
 * in the markdown, a chip in the editor. Not a Lexical LinkNode — that one's
 * sanitizeUrl turns `bible:` into about:blank. The href is the truth; the
 * link text is kept byte for byte (it is only a fallback label: the chip
 * names the reference in the UI language).
 */

export type SerializedScriptureRefNode = Spread<{ href: string; text: string }, SerializedLexicalNode>;

export class ScriptureRefNode extends DecoratorNode<ReactNode> {
  __href: string;
  __text: string;

  static getType(): string {
    return "scripture-ref";
  }

  static clone(node: ScriptureRefNode): ScriptureRefNode {
    return new ScriptureRefNode(node.__href, node.__text, node.__key);
  }

  static importJSON(json: SerializedScriptureRefNode): ScriptureRefNode {
    return $createScriptureRefNode(json.href, json.text);
  }

  constructor(href = "", text = "", key?: NodeKey) {
    super(key);
    this.__href = href;
    this.__text = text;
  }

  exportJSON(): SerializedScriptureRefNode {
    return { ...super.exportJSON(), type: ScriptureRefNode.getType(), version: 1, href: this.__href, text: this.__text };
  }

  createDOM(): HTMLElement {
    const el = document.createElement("span");
    el.dataset.scriptureRef = "";
    return el;
  }

  updateDOM(): false {
    return false;
  }

  /** Pasted HTML never becomes a chip (Lexical's own clipboard keeps it,
   * through exportJSON). */
  static importDOM(): null {
    return null;
  }

  /** Outside the app (copy into a mail) it's the label as plain text. */
  exportDOM(): DOMExportOutput {
    const el = document.createElement("span");
    el.textContent = this.__text;
    return { element: el };
  }

  isInline(): true {
    return true;
  }

  getTextContent(): string {
    return this.getLatest().__text;
  }

  getHref(): string {
    return this.getLatest().__href;
  }

  getRef(): ScriptureRef | null {
    return parseScriptureHref(this.getHref());
  }

  decorate(editor: LexicalEditor): ReactNode {
    return <ScriptureChip editor={editor} nodeKey={this.__key} href={this.__href} text={this.__text} />;
  }
}

export function $createScriptureRefNode(href: string, text: string): ScriptureRefNode {
  return new ScriptureRefNode(href, text);
}

export function $isScriptureRefNode(node: LexicalNode | null | undefined): node is ScriptureRefNode {
  return node instanceof ScriptureRefNode;
}

/** MDXEditor's visitor types (mdast's own types aren't a dependency here). */
type ImportVisitor = typeof addImportVisitor$ extends NodeRef<infer T> ? Exclude<T, unknown[]> : never;
type ExportVisitor = typeof addExportVisitor$ extends NodeRef<infer T> ? Exclude<T, unknown[]> : never;
type MdNode = { type: string; value?: unknown; url?: string; children?: MdNode[] };

/** The plain text of an mdast subtree (a link's label). */
function textOf(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

/** `[…](bible:…)` → chip, ahead of the link visitor. A malformed `bible:`
 * link stays an ordinary link (as before). */
export const MdastScriptureRefVisitor: ImportVisitor = {
  testNode: (node) => node.type === "link" && parseScriptureHref((node as MdNode).url ?? "") !== null,
  visitNode({ mdastNode, lexicalParent }) {
    const link = mdastNode as MdNode;
    if ($isElementNode(lexicalParent)) lexicalParent.append($createScriptureRefNode(link.url ?? "", textOf(link)));
  },
  priority: 100,
};

/** Chip → `[text](href)`, as it came in. */
export const LexicalScriptureRefVisitor: ExportVisitor = {
  testLexicalNode: $isScriptureRefNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    const chip = lexicalNode as ScriptureRefNode;
    actions.appendToParent(mdastParent, {
      type: "link",
      url: chip.getHref(),
      title: null,
      children: [{ type: "text", value: chip.getTextContent() }],
    } as never);
  },
};

/** The registered MDXEditor plugin: node, markdown visitors, the `@`
 * typeahead, Backspace/Enter on chips, the "removed · Undo" toast. */
export const scriptureRefPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addActivePlugin$]: "scriptureRef",
      [addLexicalNode$]: ScriptureRefNode,
      [addImportVisitor$]: MdastScriptureRefVisitor,
      [addExportVisitor$]: LexicalScriptureRefVisitor,
      [addComposerChild$]: [ScriptureRefKeys, RefTypeahead, RefRemovalToast],
    });
  },
});

/** Starts with a letter or digit: a chip put right before it gets a space. */
const WORDISH = /^[\p{L}\p{N}]/u;

/**
 * Inserts a chip at the current selection (replacing selected text), or at
 * the end of the note with none; the caret lands after it. Put before a
 * word, a space separates them. Call inside editor.update.
 */
export function $insertScriptureRef(href: string, text: string): ScriptureRefNode {
  const chip = $createScriptureRefNode(href, text);
  let sel = $getSelection();
  if (!$isRangeSelection(sel)) {
    $getRoot().selectEnd();
    sel = $getSelection();
  }
  $insertNodes([chip]);
  // Not at a line's end: a trailing space would be saved as "&#x20;"
  const next = chip.getNextSibling();
  if ($isTextNode(next) && WORDISH.test(next.getTextContent())) {
    const space = $createTextNode(" ");
    chip.insertAfter(space);
    space.select(1, 1);
  } else {
    chip.selectNext(0, 0);
  }
  return chip;
}

/** The editor's selection, kept while focus is elsewhere (a toolbar tap —
 * iOS drops the editor's focus; the verse dialog). */
export function saveSelection(editor: LexicalEditor): BaseSelection | null {
  return editor.getEditorState().read(() => $getSelection()?.clone() ?? null);
}

/** Puts a saved selection back if what it points at is still there (a
 * selected chip: the caret after it); else the caret goes to the end of the
 * note. Call inside editor.update. */
export function $restoreSelection(saved: BaseSelection | null): void {
  if ($isRangeSelection(saved)) {
    const ok = [saved.anchor, saved.focus].every((p) => {
      const node = $getNodeByKey(p.key);
      if (!node || !node.isAttached()) return false;
      const size = $isTextNode(node) ? node.getTextContentSize() : $isElementNode(node) ? node.getChildrenSize() : 0;
      return p.offset <= size;
    });
    if (ok) {
      const sel = $createRangeSelection();
      sel.anchor.set(saved.anchor.key, saved.anchor.offset, saved.anchor.type);
      sel.focus.set(saved.focus.key, saved.focus.offset, saved.focus.type);
      $setSelection(sel);
      return;
    }
  } else if ($isNodeSelection(saved)) {
    // A selected chip: the caret right after it (typing goes on from there)
    const last = saved.getNodes().filter((n) => n.isAttached()).at(-1);
    if (last) {
      last.selectNext(0, 0);
      return;
    }
  }
  $getRoot().selectEnd();
}

/** Selects one chip (Backspace's first press, a click's target). */
export function $selectChip(node: ScriptureRefNode): void {
  const sel = $createNodeSelection();
  sel.add(node.getKey());
  $setSelection(sel);
}
