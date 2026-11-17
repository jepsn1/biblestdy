/**
 * Taking a chip out of a sentence (#226, the overview's ×): the separators
 * and spaces it leaves are tidied too — "See [John 3:16], John 3:15" reads
 * "See John 3:15", never "See , John 3:15". Only what touches the chip
 * goes; Undo puts the text back exactly (one edit: the removal and the
 * tidy together).
 */

/** How many characters to cut from the end of the text before the chip
 * and the start of the text after it. */
export type Tidy = { before: number; after: number };

/** Stands for a neighbour that isn't text (another chip): a word. */
export const NOT_TEXT = "￼";

const CLOSING = /^[.,;:!?)\]]/;
const SEP_AFTER = /^\s*[,;]\s*/;
const SEP_BEFORE = /\s*[,;]\s*$/;

/**
 * `before` / `after`: the text either side of the chip, within its block
 * ("" = the block's start or end).
 */
export function tidyAround(before: string, after: string): Tidy {
  let b = before;
  let a = after;
  // "([x])" → nothing left in the brackets: they go too
  if (/\(\s*$/.test(b) && /^\s*\)/.test(a)) {
    b = b.replace(/\s*\(\s*$/, "");
    a = a.replace(/^\s*\)/, "");
  }
  const sepAfter = a.match(SEP_AFTER)?.[0];
  const sepBefore = b.match(SEP_BEFORE)?.[0];
  if (sepAfter && (b === "" || /[\s(]$/.test(b) || sepBefore)) {
    // "See [x], John 3:15" / "[x]; Rom 8" / "(cf. [x]; Rom 8)"
    a = a.slice(sepAfter.length);
  } else if (sepBefore && (a === "" || CLOSING.test(a.trimStart()) || a.trim() === "")) {
    // "John 3:15, [x]." / "John 3:15, [x]" at the end
    b = b.slice(0, -sepBefore.length);
  }
  // The spaces either side: one at most, none before a stop or at an edge
  if (/\s$/.test(b) && /^\s/.test(a)) a = a.trimStart();
  if (/\s$/.test(b) && (a === "" || CLOSING.test(a))) b = b.trimEnd();
  if ((b === "" || /\($/.test(b)) && /^\s/.test(a)) a = a.trimStart();
  // Only ever trimmed: what's left is a prefix of `before`, a suffix of `after`
  return { before: before.length - b.length, after: after.length - a.length };
}

/** A markdown body with the links at `ranges` ([start, end) offsets, in
 * text order) taken out and tidied around. */
export function removeLinksTidy(body: string, ranges: { start: number; end: number }[]): string {
  let next = body;
  for (const r of [...ranges].sort((x, y) => y.start - x.start)) {
    const lineStart = next.lastIndexOf("\n", r.start - 1) + 1;
    const nl = next.indexOf("\n", r.end);
    const lineEnd = nl === -1 ? next.length : nl;
    const t = tidyAround(next.slice(lineStart, r.start), next.slice(r.end, lineEnd));
    next = next.slice(0, r.start - t.before) + next.slice(r.end + t.after);
  }
  return next;
}
