import { parseScriptureHref, type MarkLink } from "@biblestdy/shared";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  HISTORIC_TAG,
  UNDO_COMMAND,
  type EditorState,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { dismissNotice, postNotice, undoMs } from "~/lib/notices";
import { bookLocale } from "~/lib/book-name";
import { chipLabel } from "~/lib/reference-label";
import { $createScriptureRefNode, $isScriptureRefNode } from "./scripture-ref-node";

/** Where a chip sat, to put it back. */
type Place = { href: string; text: string; mark: MarkLink | null; prevKey: NodeKey | null; parentKey: NodeKey | null; index: number };

/** Every chip in a state, by href, with where its first one sits. */
function chipsIn(state: EditorState): Map<string, Place> {
  const out = new Map<string, Place>();
  state.read(() => {
    const walk = (node: LexicalNode) => {
      if ($isScriptureRefNode(node)) {
        const href = node.getHref();
        if (!out.has(href))
          out.set(href, {
            href,
            text: node.getTextContent(),
            mark: node.getMark(),
            prevKey: node.getPreviousSibling()?.getKey() ?? null,
            parentKey: node.getParent()?.getKey() ?? null,
            index: node.getIndexWithinParent(),
          });
      } else if ($isElementNode(node)) for (const c of node.getChildren()) walk(c);
    };
    walk($getRoot());
  });
  return out;
}

/** Puts a removed chip back where it was, as near as the text allows. */
function $putBack(p: Place) {
  const chip = $createScriptureRefNode(p.href, p.text, p.mark);
  const prev = p.prevKey ? $getNodeByKey(p.prevKey) : null;
  const parent = p.parentKey ? $getNodeByKey(p.parentKey) : null;
  if (prev?.isAttached()) prev.insertAfter(chip);
  else if ($isElementNode(parent) && parent.isAttached()) parent.splice(Math.min(p.index, parent.getChildrenSize()), 0, [chip]);
  else {
    const last = $getRoot().getLastChild();
    if ($isParagraphNode(last)) last.append(chip);
    else return;
  }
  chip.selectNext(0, 0);
}

/**
 * The note's reference list follows its text (#160, owner default): taking
 * the last chip of a reference out of the text takes the reference off the
 * note. The note's notice line says so (#257) — "Joh 3,16 fjernet fra noten
 * · Fortryd" — never taking focus. Fortryd = Ctrl+Z while nothing else
 * changed since; after more typing it puts the chip back where it was.
 */
export function RefRemovalNotice() {
  const editor = useCellValue(rootEditor$);
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  useEffect(() => {
    if (!editor) return;
    let edits = 0;
    const shown = new Map<string, number>();
    return editor.registerUpdateListener(({ editorState, prevEditorState, tags, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      edits++;
      const before = chipsIn(prevEditorState);
      const after = chipsIn(editorState);
      if (tags.has(HISTORIC_TAG)) {
        // Ctrl+Z brought it back: the notice has said its piece
        for (const href of after.keys()) {
          const id = shown.get(href);
          if (id !== undefined) dismissNotice(id);
          shown.delete(href);
        }
        return;
      }
      for (const [href, place] of before) {
        if (after.has(href)) continue;
        const ref = parseScriptureHref(href);
        const at = edits;
        const id = postNotice("note", {
          kind: "undo",
          message: t("note.refRemoved", { ref: ref ? chipLabel(ref, locale) : place.text }),
          ms: undoMs(),
          action: {
            label: t("notice.undo"),
            run: () => {
              if (edits === at) editor.dispatchCommand(UNDO_COMMAND, undefined);
              else editor.update(() => $putBack(place));
            },
          },
        });
        shown.set(href, id);
      }
    });
  }, [editor, t, locale]);
  return null;
}
