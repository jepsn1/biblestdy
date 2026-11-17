import type { Anchor, WordPos } from "@biblestdy/shared";

/**
 * What a click (or tap) on a word does (#212, the panel's click map C3):
 * the reader's own ink owns the word — a mark opens its menu, with an
 * "Open note: X" row per note linked there on top; words with only a note
 * link open that note. The eraser takes the reader's ink, never a link:
 * over a link alone it says where to remove it. Pure; word-click.test.ts.
 */

/** A note linked at the word: one entry per note, most specific link first. */
export type NoteAtWord = { noteId: string; title: string };

/** A note mark as the rule sees it (note-marks.ts' NoteMark). */
type NoteLink = Anchor & { noteId: string; title: string; verseLevel?: boolean };

const at = (v: number, w: number) => v * 100000 + w;
const covers = (a: Anchor, pos: WordPos) =>
  at(a.startVerse, a.startWord) <= at(pos.verse, pos.word) && at(pos.verse, pos.word) <= at(a.endVerse, a.endWord);
const size = (a: Anchor) => at(a.endVerse, a.endWord) - at(a.startVerse, a.startWord);

/** The notes linked at `pos` (word-precise or whole-verse links), smallest
 * link first, one per note. */
export function notesAtWord(marks: NoteLink[], pos: WordPos): (NoteAtWord & { verseLevel: boolean })[] {
  const seen = new Set<string>();
  return marks
    .filter((m) => covers(m, pos))
    .sort((a, b) => size(a) - size(b))
    .flatMap((m) => {
      if (seen.has(m.noteId)) return [];
      seen.add(m.noteId);
      return [{ noteId: m.noteId, title: m.title, verseLevel: !!m.verseLevel }];
    });
}

/** Everything at one word: the most specific annotation and highlight, and
 * every note linked there. */
export type WordLayers<H, A extends { text?: string | null }> = {
  annotation: A | null;
  highlight: H | null;
  notes: (NoteAtWord & { verseLevel: boolean })[];
};

export type WordClick<H, A> =
  /** A pen mark (no text): its menu, note rows on top. */
  | { kind: "markMenu"; annotation: A; notes: NoteAtWord[] }
  /** A highlight: its menu, note rows on top. */
  | { kind: "highlightMenu"; highlight: H; notes: NoteAtWord[] }
  /** A margin note with text: its box takes focus (it has no menu). */
  | { kind: "focusAnnotation"; annotation: A }
  /** Several notes, or a margin note's words also linked: pick one. */
  | { kind: "notes"; notes: NoteAtWord[]; annotation?: A }
  | { kind: "openNote"; noteId: string }
  /** Nothing here: plain text (desktop: close; phone: tap-select). */
  | { kind: "none" };

/**
 * No tool. `verseLinksOpen` false (phones): a whole-verse link alone leaves
 * the tap to tap-select — it would take every word of the verse, and the
 * verse's marker opens the note — but still shows as a row in a mark's menu.
 */
export function wordClick<H, A extends { text?: string | null }>(
  { annotation, highlight, notes }: WordLayers<H, A>,
  { verseLinksOpen = true }: { verseLinksOpen?: boolean } = {},
): WordClick<H, A> {
  const rows = notes.map(({ noteId, title }) => ({ noteId, title }));
  if (annotation && !annotation.text) return { kind: "markMenu", annotation, notes: rows };
  if (annotation)
    return rows.length > 0 ? { kind: "notes", notes: rows, annotation } : { kind: "focusAnnotation", annotation };
  if (highlight) return { kind: "highlightMenu", highlight, notes: rows };
  const own = verseLinksOpen ? rows : notes.filter((n) => !n.verseLevel).map(({ noteId, title }) => ({ noteId, title }));
  if (own.length === 1) return { kind: "openNote", noteId: own[0].noteId };
  if (own.length > 1) return { kind: "notes", notes: own };
  return { kind: "none" };
}

export type EraseClick<H, A> =
  | { kind: "annotation"; annotation: A }
  | { kind: "highlight"; highlight: H }
  /** Only links here: never erased — say where to remove them. */
  | { kind: "hint"; notes: NoteAtWord[] }
  | { kind: "none" };

/** The eraser on one word: the reader's ink first (a mark under a note link
 * too), a link never. */
export function eraseClick<H, A extends { text?: string | null }>({
  annotation,
  highlight,
  notes,
}: WordLayers<H, A>): EraseClick<H, A> {
  if (annotation) return { kind: "annotation", annotation };
  if (highlight) return { kind: "highlight", highlight };
  if (notes.length > 0) return { kind: "hint", notes: notes.map(({ noteId, title }) => ({ noteId, title })) };
  return { kind: "none" };
}

/** The notes an eraser stroke over `stroke` touches (one per note, in order). */
export function notesInStroke(marks: NoteLink[], stroke: Anchor): NoteAtWord[] {
  const seen = new Set<string>();
  return marks
    .filter(
      (m) =>
        at(m.startVerse, m.startWord) <= at(stroke.endVerse, stroke.endWord) &&
        at(stroke.startVerse, stroke.startWord) <= at(m.endVerse, m.endWord),
    )
    .sort((a, b) => size(a) - size(b))
    .flatMap((m) => (seen.has(m.noteId) ? [] : (seen.add(m.noteId), [{ noteId: m.noteId, title: m.title }])));
}

/** A mark's words as a bare anchor (what the API takes for a new link). */
export function anchorOf(a: Anchor): Anchor {
  const { translationId, book, chapter, startVerse, startWord, endVerse, endWord } = a;
  return { translationId, book, chapter, startVerse, startWord, endVerse, endWord };
}
