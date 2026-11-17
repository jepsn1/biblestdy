import { formatScriptureHref, parseScriptureHref } from "@biblestdy/shared";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  type BaseSelection,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useEffect } from "react";
import { INSERT_REF, REMOVE_REF, SHOW_REF, type RefEventDetail } from "./dialog-events";
import { focusEditor, mergeRegister } from "./lexical-util";
import { $removeChipTidy } from "./ref-tidy-lexical";
import { $insertScriptureRef, $isScriptureRefNode, $restoreSelection, $selectChip } from "./scripture-ref-node";
import { endsSpotlight } from "./spotlight";

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

/** Every chip citing `href`. */
function $chips(href: string): LexicalNode[] {
  const out: LexicalNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isScriptureRefNode(node)) {
      if (canonical(node.getHref()) === href) out.push(node);
    } else if ($isElementNode(node)) for (const c of node.getChildren()) walk(c);
  };
  walk($getRoot());
  return out;
}

/**
 * The references overview's hands in the editor (#161): "Show in text"
 * selects the reference's first chip, scrolls it into view and tints it
 * until the next click or Escape (#190)
 * (focus moves there, in the editor); "Insert in text" puts a chip where the
 * caret last was; its × on a text reference (#214) takes every chip of it
 * out (one step, so the removal toast's Undo puts them all back). Listens on the note panel's <aside>, so a second editor
 * elsewhere never answers.
 */
export function RefBridge() {
  const editor = useCellValue(rootEditor$);
  useEffect(() => {
    if (!editor) return;
    // The caret as it last stood: clicking the overview takes focus away
    let last: BaseSelection | null = null;
    let aside: HTMLElement | null = null;
    let lit: HTMLElement | null = null;
    const unlight = () => {
      lit?.classList.remove("chip-flash");
      lit = null;
      document.removeEventListener("click", onEnd, true);
      document.removeEventListener("keydown", onEnd, true);
    };
    // Added mid-click: this click's capture phase is past, so it can't end it
    const onEnd = (e: Event) => {
      if (endsSpotlight(e as KeyboardEvent, document)) unlight();
    };

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
      // The tint: CSS .chip-flash, no timer (#190)
      unlight();
      el.classList.add("chip-flash");
      lit = el;
      document.addEventListener("click", onEnd, true);
      document.addEventListener("keydown", onEnd, true);
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
    const onRemove = (e: Event) => {
      const detail = (e as CustomEvent<RefEventDetail>).detail;
      detail.done = true;
      // Its separators go with it (#226), in the same edit
      editor.update(
        () => {
          for (const chip of $chips(detail.href)) $removeChipTidy(chip);
        },
        { tag: HISTORY_PUSH_TAG },
      );
    };
    const unlisten = () => {
      aside?.removeEventListener(SHOW_REF, onShow);
      aside?.removeEventListener(INSERT_REF, onInsert);
      aside?.removeEventListener(REMOVE_REF, onRemove);
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
        aside?.addEventListener(REMOVE_REF, onRemove);
      }),
      unlisten,
      unlight,
    );
  }, [editor]);
  return null;
}
