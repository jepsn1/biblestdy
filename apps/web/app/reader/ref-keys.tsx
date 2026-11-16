import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";
import { $isScriptureRefNode, $selectChip } from "./scripture-ref-node";
import { requestOpenChip } from "./scripture-chip";
import { mergeRegister } from "./lexical-util";

/** The node right before (`back`) or after the collapsed caret. */
function $besideCaret(sel: RangeSelection, back: boolean): LexicalNode | null {
  const { anchor } = sel;
  const node = anchor.getNode();
  if (anchor.type === "element" && $isElementNode(node)) return node.getChildAtIndex(back ? anchor.offset - 1 : anchor.offset);
  if ($isTextNode(node)) {
    if (back && anchor.offset === 0) return node.getPreviousSibling();
    if (!back && anchor.offset === node.getTextContentSize()) return node.getNextSibling();
  }
  return null;
}

/**
 * Keys on chips (#160): Backspace (or Delete) next to a chip selects it
 * first, the second press removes it — the toast offers Undo. Enter on a
 * selected chip opens its preview.
 */
export function ScriptureRefKeys() {
  const editor = useCellValue(rootEditor$);
  useEffect(() => {
    if (!editor) return;
    const remove = (back: boolean) => (event: KeyboardEvent | null) => {
      const sel = $getSelection();
      if ($isNodeSelection(sel)) {
        const chips = sel.getNodes().filter($isScriptureRefNode);
        if (chips.length === 0 || chips.length !== sel.getNodes().length) return false;
        event?.preventDefault();
        const [first] = chips;
        if (back) first.selectPrevious();
        else chips[chips.length - 1].selectNext(0, 0);
        for (const c of chips) c.remove();
        return true;
      }
      if ($isRangeSelection(sel) && sel.isCollapsed()) {
        const beside = $besideCaret(sel, back);
        if ($isScriptureRefNode(beside)) {
          event?.preventDefault();
          $selectChip(beside);
          return true;
        }
      }
      return false;
    };
    return mergeRegister(
      editor.registerCommand(KEY_BACKSPACE_COMMAND, remove(true), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_DELETE_COMMAND, remove(false), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const sel = $getSelection();
          if (!$isNodeSelection(sel)) return false;
          const nodes = sel.getNodes();
          if (nodes.length !== 1 || !$isScriptureRefNode(nodes[0])) return false;
          event?.preventDefault();
          requestOpenChip(nodes[0].getKey());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);
  return null;
}
