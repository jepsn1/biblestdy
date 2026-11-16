import type { Anchor, BookLocale, Chapter } from "@biblestdy/shared";
import { anchorReference, bookName, words, wordRangeInVerse } from "@biblestdy/shared";
import { referenceLabel } from "../notes/note-list";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Text of the selected words, verses joined by a space. */
function selectedText(chapter: Chapter, anchor: Anchor): string {
  const parts: string[] = [];
  for (const v of chapter.verses) {
    const tokens = words(v.text);
    const range = wordRangeInVerse(anchor, v.verse, tokens.length);
    if (range) parts.push(tokens.slice(range.start, range.end + 1).join(" "));
  }
  return parts.join(" ");
}

/**
 * Most verses one copy (or print) may carry: API.Bible ToS §12 — content
 * may not be freely copied, printing is restricted to 100 verses.
 */
export const MAX_COPY_VERSES = 100;

/** How many verses an anchor covers in this chapter (a bridge "14–15"
 * counts as both). */
export function anchorVerseCount(chapter: Chapter, anchor: Anchor): number {
  let count = 0;
  for (const v of chapter.verses) {
    if (v.verse < anchor.startVerse || v.verse > anchor.endVerse) continue;
    const bridge = v.label ? /[-–](\d+)$/.exec(v.label) : null;
    count += bridge ? Math.max(1, Number(bridge[1]) - v.verse + 1) : 1;
  }
  return count;
}

/** Within the copy limit? */
export function canCopy(chapter: Chapter, anchor: Anchor): boolean {
  return anchorVerseCount(chapter, anchor) <= MAX_COPY_VERSES;
}

/** Longest quote the API stores (MAX_QUOTE there). */
export const MAX_QUOTE = 2000;

/**
 * The marked words of an anchor as stored on a highlight/annotation (palette
 * search): plain text, no verse numbers, words joined by spaces. Clipped to
 * what the API accepts; "" when the anchor isn't in this chapter.
 */
export function anchorQuote(chapter: Chapter, anchor: Anchor): string {
  return selectedText(chapter, anchor).slice(0, MAX_QUOTE).trim();
}

/** An anchor's reference in the UI language: "Johannes 3,16–18" / "John 3:16–18". */
export function anchorReferenceLabel(anchor: Anchor, locale: BookLocale): string {
  return referenceLabel(anchorReference(anchor), (id) => bookName(id, locale), locale);
}

/**
 * Clipboard payload for copying a selection out of the reader: the selected
 * words, then a reference line in the UI language ("John 3:16–18 (NIV)" /
 * "Johannes 3,16–18 (NIV)"), then the chapter's
 * copyright line when the translation has one (licensors expect both).
 */
export function formatCopy(
  chapter: Chapter,
  anchor: Anchor,
  abbreviation: string,
  locale: BookLocale = "en",
): { text: string; html: string } {
  const lines = [
    selectedText(chapter, anchor),
    `${anchorReferenceLabel(anchor, locale)} (${abbreviation})`,
  ];
  const copyright = chapter.copyright?.trim();
  if (copyright) lines.push(copyright);
  return { text: lines.join("\n"), html: lines.map(escapeHtml).join("<br>") };
}
