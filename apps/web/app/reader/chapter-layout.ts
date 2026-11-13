import type { Chapter, TextBlock, Verse } from "@biblestdy/shared";
import { words } from "@biblestdy/shared";

/** One word as rendered: its anchor index plus the slice of it shown here
 * (a poetry line can start inside a word the source joined without a space —
 * that word is split across two blocks but stays ONE anchorable word). */
export type WordPiece = { i: number; text: string; /** word continues in the next block */ cut: boolean };

/** The part of a verse that falls inside one block. */
export type VersePiece = {
  verse: Verse;
  /** Verse starts here → print its number/label. */
  showNumber: boolean;
  words: WordPiece[];
};

export type LaidBlock = {
  kind: TextBlock["kind"];
  level: number;
  stanza: boolean;
  /** Section headings printed above this block. */
  headings: string[];
  /** First block of the chapter or right after a heading — no indent, like a book. */
  opening: boolean;
  pieces: VersePiece[];
};

type Break = Omit<TextBlock, "kind"> & Partial<Pick<TextBlock, "kind">>;

const posKey = (verse: number, word: number) => `${verse}:${word}`;

/**
 * Lay a chapter out into paragraph/poetry blocks. Pure: verse text and word
 * indices are exactly `words(verse.text)` — layout only decides where blocks
 * start. Chapters without `blocks` (fixtures, older cache entries) render as
 * one continuous flow per section, like before.
 */
export function layoutChapter(chapter: Chapter): LaidBlock[] {
  const headingsAt = new Map<number, string[]>();
  for (const s of chapter.sections ?? []) {
    headingsAt.set(s.beforeVerse, [...(headingsAt.get(s.beforeVerse) ?? []), s.title]);
  }

  // Valid breaks by position; headings force a break at their verse start
  const wordsOf = new Map(chapter.verses.map((v) => [v.verse, words(v.text)]));
  const breaks = new Map<string, Break[]>();
  const addBreak = (b: Break) => {
    const k = posKey(b.verse, b.word);
    // One break per exact spot (verse, word, char)
    const rest = (breaks.get(k) ?? []).filter((x) => (x.char ?? 0) !== (b.char ?? 0));
    breaks.set(k, [...rest, b].sort((x, y) => (x.char ?? 0) - (y.char ?? 0)));
  };
  for (const b of chapter.blocks ?? []) {
    const ws = wordsOf.get(b.verse);
    if (!ws || b.word < 0 || b.word >= ws.length) continue;
    if (b.char !== undefined && (b.char <= 0 || b.char >= ws[b.word].length)) {
      addBreak({ ...b, char: undefined });
      continue;
    }
    addBreak(b);
  }
  for (const verse of headingsAt.keys()) {
    const k = posKey(verse, 0);
    if (wordsOf.has(verse) && !(breaks.get(k) ?? []).some((b) => !b.char)) {
      addBreak({ verse, word: 0 });
    }
  }

  const out: LaidBlock[] = [];
  let current: LaidBlock | null = null;
  let lastKind: TextBlock["kind"] = "flush";
  let lastLevel = 1;
  const open = (b: Break | null, headings: string[]) => {
    // A heading-forced break continues the previous block's kind
    const kind = b?.kind ?? (out.length === 0 ? "flush" : lastKind === "poetry" ? "poetry" : "paragraph");
    const level = b?.level ?? (kind === "poetry" ? lastLevel : 1);
    current = {
      kind,
      level,
      stanza: !!b?.stanza && out.length > 0 && headings.length === 0,
      headings,
      opening: out.length === 0 || headings.length > 0,
      pieces: [],
    };
    out.push(current);
    lastKind = kind;
    lastLevel = level;
    return current;
  };
  const piece = (block: LaidBlock, verse: Verse, showNumber: boolean) => {
    const p: VersePiece = { verse, showNumber, words: [] };
    block.pieces.push(p);
    return p;
  };

  for (const verse of chapter.verses) {
    const ws = wordsOf.get(verse.verse)!;
    let p: VersePiece | null = null;
    ws.forEach((word, i) => {
      const here = breaks.get(posKey(verse.verse, i)) ?? [];
      // Verse continues the running block unless a block starts right here
      if (i === 0 && !here.some((b) => !b.char)) {
        p = piece(current ?? open(null, []), verse, true);
      }
      let start = 0;
      for (const b of here) {
        const cut = b.char ?? 0;
        if (cut > 0 && p) {
          (p as VersePiece).words.push({ i, text: word.slice(start, cut), cut: true });
          start = cut;
        }
        const atVerseStart = i === 0 && start === 0;
        const block = open(b, atVerseStart ? (headingsAt.get(verse.verse) ?? []) : []);
        p = piece(block, verse, atVerseStart);
      }
      (p as VersePiece | null)?.words.push({ i, text: start > 0 ? word.slice(start) : word, cut: false });
    });
  }
  return out;
}
