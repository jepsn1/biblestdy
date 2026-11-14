import type { Anchor, Chapter } from "@biblestdy/shared";
import { anchorReference, formatReference, words, wordRangeInVerse } from "@biblestdy/shared";

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

/**
 * Clipboard payload for copying a selection out of the reader: the selected
 * words, then a reference line ("John 3:16-18 (NIV)"), then the chapter's
 * copyright line when the translation has one (licensors expect both).
 */
export function formatCopy(
  chapter: Chapter,
  anchor: Anchor,
  abbreviation: string,
): { text: string; html: string } {
  const lines = [
    selectedText(chapter, anchor),
    `${formatReference(anchorReference(anchor))} (${abbreviation})`,
  ];
  const copyright = chapter.copyright?.trim();
  if (copyright) lines.push(copyright);
  return { text: lines.join("\n"), html: lines.map(escapeHtml).join("<br>") };
}
