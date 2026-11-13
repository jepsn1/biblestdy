import type { WordPos } from "@biblestdy/shared";

/**
 * Keyboard study (#65): the reader's verse cursor and word-snapped selection,
 * as pure steps over the chapter's verse order + word counts.
 *
 * - The cursor is a verse (↑/↓ move it). Keys act on the selection if there
 *   is one, else on the whole cursor verse.
 * - A selection has a fixed end `a` and a moving end `b` (same shape as the
 *   phone's tap selection; `buildAnchor` normalizes the order).
 * - Shift+→ with no selection starts at the cursor verse's first word,
 *   Shift+← at its last word; after that `b` moves one word, across verses.
 * - Shift+↓/↑ move `b` to the end of the next / start of the previous verse.
 */

/** The focusable verse number (#65): one per verse, roving tabindex. */
export const VERSE_FOCUS = "data-verse-focus";

export type KeySel = { a: WordPos; b: WordPos };

/** Verse numbers in reading order + each verse's word count. */
export type VerseIndex = { order: number[]; words: Map<number, number> };

const lastWord = (idx: VerseIndex, verse: number) => Math.max(0, (idx.words.get(verse) ?? 1) - 1);

/** The verse before/after `verse`; stays put at the chapter's ends. */
export function stepVerse(idx: VerseIndex, verse: number, dir: -1 | 1): number {
  const i = idx.order.indexOf(verse);
  if (i < 0) return idx.order[0];
  return idx.order[Math.max(0, Math.min(idx.order.length - 1, i + dir))];
}

/** Shift+←/→: grow or shrink the selection by one word. */
export function extendByWord(idx: VerseIndex, sel: KeySel | null, cursor: number, dir: -1 | 1): KeySel {
  if (!sel) {
    const start = { verse: cursor, word: dir === 1 ? 0 : lastWord(idx, cursor) };
    return { a: start, b: start };
  }
  const { verse, word } = sel.b;
  let b: WordPos;
  if (dir === 1) {
    if (word < lastWord(idx, verse)) b = { verse, word: word + 1 };
    else {
      const next = stepVerse(idx, verse, 1);
      b = next === verse ? sel.b : { verse: next, word: 0 };
    }
  } else if (word > 0) b = { verse, word: word - 1 };
  else {
    const prev = stepVerse(idx, verse, -1);
    b = prev === verse ? sel.b : { verse: prev, word: lastWord(idx, prev) };
  }
  return { a: sel.a, b };
}

/** Shift+↓/↑: the moving end jumps a verse (whole verses from the cursor). */
export function extendByVerse(idx: VerseIndex, sel: KeySel | null, cursor: number, dir: -1 | 1): KeySel {
  if (!sel) {
    return dir === 1
      ? { a: { verse: cursor, word: 0 }, b: { verse: cursor, word: lastWord(idx, cursor) } }
      : { a: { verse: cursor, word: lastWord(idx, cursor) }, b: { verse: cursor, word: 0 } };
  }
  const target = stepVerse(idx, sel.b.verse, dir);
  return { a: sel.a, b: { verse: target, word: dir === 1 ? lastWord(idx, target) : 0 } };
}

/** The whole verse as a selection (what h/n/m/c act on without one). */
export function verseSel(idx: VerseIndex, verse: number): KeySel {
  return { a: { verse, word: 0 }, b: { verse, word: lastWord(idx, verse) } };
}
