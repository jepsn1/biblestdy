import type { LexicalEditor } from "lexical";

/** Runs every cleanup (Lexical's register* functions each return one). */
export function mergeRegister(...cleanups: (() => void)[]): () => void {
  return () => {
    for (const c of cleanups) c();
  };
}

/** Focus back in the editor. Lexical's own focus() works through the DOM
 * selection, which a selected chip (a node selection) doesn't have. */
export function focusEditor(editor: LexicalEditor, select?: () => void): void {
  editor.getRootElement()?.focus({ preventScroll: true });
  if (select) editor.update(select);
  editor.focus();
}
