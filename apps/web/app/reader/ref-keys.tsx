import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import {
  $getNodeByKey,
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
import { useContext, useEffect } from "react";
import { $isScriptureRefNode, $selectChip } from "./scripture-ref-node";
import { requestOpenChip } from "./scripture-chip";
import { mergeRegister } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";

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

/** Keys a selected chip handles itself (or Lexical does, arrows). */
const CHIP_KEYS = new Set(["Backspace", "Delete", "Enter", "Escape", "ArrowLeft", "ArrowRight", "Tab", "Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

/**
 * Keys on chips (#160): Backspace (or Delete) next to a chip selects it
 * first, the second press removes it — the toast offers Undo. Enter on a
 * selected chip opens its preview; Alt+Enter spotlights it in the Bible. Any other key (typing, End, ↑↓) first
 * puts the caret after the chip — a selected chip has no DOM caret, and the
 * browser would act at the start of the note.
 */
export function ScriptureRefKeys() {
  const editor = useCellValue(rootEditor$);
  const { spotlightsChip } = useContext(ScriptureRefContext).kit;
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
    const caretAfterChip = (e: KeyboardEvent) => {
      if (e.isComposing || CHIP_KEYS.has(e.key)) return;
      // Ctrl/⌘ + a letter is a command (copy, cut, undo, Shift+E)
      if ((e.ctrlKey || e.metaKey) && e.key.length === 1) return;
      const chip = editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isNodeSelection(sel)) return null;
        const nodes = sel.getNodes();
        return nodes.length > 0 && nodes.every($isScriptureRefNode) ? nodes[nodes.length - 1].getKey() : null;
      });
      if (!chip) return;
      // Synchronously, before the browser acts on the key
      editor.update(() => $getNodeByKey(chip)?.selectNext(0, 0), { discrete: true });
    };
    return mergeRegister(
      editor.registerRootListener((root, prev) => {
        prev?.removeEventListener("keydown", caretAfterChip, true);
        root?.addEventListener("keydown", caretAfterChip, true);
      }),
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
          // Alt+Enter (#213): straight to the Bible, no preview
          requestOpenChip(nodes[0].getKey(), !!event && spotlightsChip(event));
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, spotlightsChip]);
  return null;
}
