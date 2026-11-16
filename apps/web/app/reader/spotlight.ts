import { type Anchor, type Chapter, words, wordRangeInVerse } from "@biblestdy/shared";

/** Spotlight id of a note's reference — matches the anchor pipeline's
 * namespaced "note:<noteId>:<anchorId>". */
export const noteMarkId = (m: { noteId: string; id: string }) => `note:${m.noteId}:${m.id}`;

/**
 * Words ("verse:word") of the reference selected in the note panel: they stay
 * in full ink while the rest of the page mutes. Taken from the reference's
 * own word range, never from which mark won a word's click coverage — a pen
 * mark, another note or a straddling mark over some of its words would
 * otherwise leave muted holes inside the spotlit passage.
 */
export function spotlitWords(
  verses: Chapter["verses"],
  noteMarks: (Anchor & { noteId: string; id: string })[],
  selectedMarkId: string | null,
): Set<string> {
  const lit = new Set<string>();
  const mark = selectedMarkId == null ? undefined : noteMarks.find((m) => noteMarkId(m) === selectedMarkId);
  if (!mark) return lit;
  for (const v of verses) {
    const range = wordRangeInVerse(mark, v.verse, words(v.text).length);
    if (!range) continue;
    for (let w = range.start; w <= range.end; w++) lit.add(`${v.verse}:${w}`);
  }
  return lit;
}

/**
 * The first word of a note's reference ("[data-verse][data-word]" selector) —
 * where the reader turns or scrolls to. From the reference's own anchor, not
 * its wrapper span: a reference wholly covered by smaller marks renders no
 * wrapper of its own. Null until the mark is known (notes still loading).
 */
export function markStartSelector(
  noteMarks: (Anchor & { noteId: string; id: string })[],
  markId: string,
): string | null {
  const m = noteMarks.find((n) => noteMarkId(n) === markId);
  return m ? `[data-verse="${m.startVerse}"][data-word="${m.startWord}"]` : null;
}
