import { formatScriptureHref, parseScriptureHref } from "@biblestdy/shared";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import { $getNodeByKey, $getRoot, $getSelection, $isElementNode, $isRangeSelection, type BaseSelection, type LexicalNode, type NodeKey } from "lexical";
import { useEffect } from "react";
import { INSERT_REF, SHOW_REF, type RefEventDetail } from "./dialog-events";
import { focusEditor, mergeRegister } from "./lexical-util";
import { $insertScriptureRef, $isScriptureRefNode, $restoreSelection, $selectChip } from "./scripture-ref-node";

const canonical = (href: string) => {
  const ref = parseScriptureHref(href);
  return (ref && formatScriptureHref(ref)) ?? href;
};

/** The first chip citing `href`, in text order. */
function $firstChip(href: string): NodeKey | null {
  const walk = (node: LexicalNode): NodeKey | null => {
    if ($isScriptureRefNode(node)) return canonical(node.getHref()) === href ? node.getKey() : null;
    if (!$isElementNode(node)) return null;
    for (const c of node.getChildren()) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk($getRoot());
}

/**
 * The references overview's hands in the editor (#161): "Show in text"
 * selects the reference's first chip, scrolls it into view and flashes it
 * (focus moves there, in the editor); "Insert in text" puts a chip where the
 * caret last was. Listens on the note panel's <aside>, so a second editor
 * elsewhere never answers.
 */
export function RefBridge() {
  const editor = useCellValue(rootEditor$);
  useEffect(() => {
    if (!editor) return;
    // The caret as it last stood: clicking the overview takes focus away
    let last: BaseSelection | null = null;
    let aside: HTMLElement | null = null;
    let flashTimer = 0;

    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<RefEventDetail>).detail;
      const key = editor.getEditorState().read(() => $firstChip(detail.href));
      if (!key) return;
      detail.done = true;
      focusEditor(editor, () => {
        const node = $getNodeByKey(key);
        if ($isScriptureRefNode(node)) $selectChip(node);
      });
      const el = editor.getElementByKey(key);
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      // The flash: CSS .chip-flash (none under reduced motion — the
      // selection ring says it)
      el.classList.remove("chip-flash");
      void el.offsetWidth;
      el.classList.add("chip-flash");
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => el.classList.remove("chip-flash"), 2600);
    };
    const onInsert = (e: Event) => {
      const detail = (e as CustomEvent<RefEventDetail>).detail;
      detail.done = true;
      const at = last;
      focusEditor(editor, () => {
        $restoreSelection(at);
        $insertScriptureRef(detail.href, detail.text);
      });
    };
    const unlisten = () => {
      aside?.removeEventListener(SHOW_REF, onShow);
      aside?.removeEventListener(INSERT_REF, onInsert);
      aside = null;
    };
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) last = sel.clone();
        }),
      ),
      editor.registerRootListener((root) => {
        unlisten();
        aside = root?.closest("aside") ?? null;
        aside?.addEventListener(SHOW_REF, onShow);
        aside?.addEventListener(INSERT_REF, onInsert);
      }),
      unlisten,
      () => window.clearTimeout(flashTimer),
    );
  }, [editor]);
  return null;
}
