import { $isLineBreakNode, $isTextNode, type LexicalNode, type TextNode } from "lexical";
import { NOT_TEXT, tidyAround } from "./ref-tidy";

/** Plain text beside the chip (token/segmented text, like a mention, is a
 * word: never cut into). */
const plain = (n: LexicalNode | null): n is TextNode => $isTextNode(n) && n.isSimpleText();

/** The chip out of its sentence, the separators and spaces it leaves
 * tidied (ref-tidy.ts). Inside the caller's `editor.update`: one edit, so
 * Ctrl+Z / the toast's Undo restores the text exactly. */
export function $removeChipTidy(chip: LexicalNode) {
  const prev = chip.getPreviousSibling();
  const next = chip.getNextSibling();
  // A line break is the line's edge, like the paragraph's
  const side = (n: LexicalNode | null) => (plain(n) ? n.getTextContent() : n && !$isLineBreakNode(n) ? NOT_TEXT : "");
  const before = side(prev);
  const after = side(next);
  const cut = tidyAround(before, after);
  chip.remove();
  if (plain(prev) && cut.before > 0) {
    if (cut.before >= before.length) prev.remove();
    else prev.setTextContent(before.slice(0, before.length - cut.before));
  }
  if (plain(next) && cut.after > 0) {
    if (cut.after >= after.length) next.remove();
    else next.setTextContent(after.slice(cut.after));
  }
}
