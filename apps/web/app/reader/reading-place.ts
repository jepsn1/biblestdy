/**
 * The reader's place across reflows (#66, #203): a word, not a verse. A verse
 * can start on the page before (3:18 runs over a page break), so holding only
 * "the page's first verse" turns one page too far back once the sheet
 * reflows — and opening a note narrows it to one column, closing widens it.
 */
export type Place = { verse: number; word: number };

/** The word's element in the chapter text. */
export const placeSelector = (p: Place) => `[data-verse="${p.verse}"][data-word="${p.word}"]`;

/** A page's verse range (folio) and its first word (the place a page the
 * reader chose sets). Words in reading order, each with its page. */
export function pageSpan(
  words: Iterable<Place & { page: number | null | undefined }>,
  page: number,
): { first: Place; lastVerse: number } | null {
  let first: Place | null = null;
  let lastVerse = 0;
  for (const w of words) {
    if (w.page !== page) continue;
    first ??= { verse: w.verse, word: w.word };
    lastVerse = w.verse;
  }
  return first && { first, lastVerse };
}

/** Where a reflow turns: the page that now holds the place, or null to stay
 * (the place is on this page, or not laid out). */
export function reflowPage(placePage: number | null, page: number, pageCount: number): number | null {
  if (placePage === null || placePage === page) return null;
  return Math.max(0, Math.min(placePage, pageCount - 1));
}
