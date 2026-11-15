import { BOOKS, bookName, suggestBooks, type BookLocale } from "@biblestdy/shared";
import { bookQuery, findPassages, typoBooks } from "../palette/passage-query";
import { referenceHref } from "./chapter-nav";

/** What the address chooser's filter makes of the typed text. */
export type PlaceFilter = {
  /** Matching books in canonical order (all of them for an empty filter). */
  books: string[];
  /** The best match: what Enter picks (null = nothing matches). */
  best: string | null;
  /** A whole passage ("sal 23", "joh 3:16"): Enter goes straight there. */
  passage: { href: string; book: string; chapter: number; verse?: number } | null;
};

/** Book-name text with its chapter/verse numbers dropped ("sal 23" → "sal"). */
function bookPart(input: string): string {
  return input.replace(/\s+\d[\d\s:,.\-–]*$/u, "").trim();
}

/**
 * The address chooser's filter (one matcher with the palette, never a copy):
 * books whose name or alias STARTS with the text, Danish and English
 * ("sal" → Salmerne, not Thessalonikerbrev), a misspelt name as a fallback;
 * and, when the text is a passage, that passage via the palette's own parser.
 */
export function filterPlaces(input: string, locale: BookLocale): PlaceFilter {
  const q = input.trim();
  if (!q) return { books: BOOKS.map((b) => b.id), best: null, passage: null };
  const hit = findPassages(q, locale, 1)[0];
  const sure = hit && hit.kind !== "fuzzy" ? hit.ref : null;
  const passage = sure
    ? { href: referenceHref(sure), book: sure.book, chapter: sure.chapter ?? 1, verse: sure.verse }
    : null;
  const part = bookPart(q);
  const found = part ? suggestBooks(bookQuery(part), locale, BOOKS.length).map((s) => s.id) : [];
  const ids = found.length ? found : part ? typoBooks(part, locale) : [];
  // The passage's book always shows, even when only the parser knew it
  if (passage && !ids.includes(passage.book)) ids.unshift(passage.book);
  const set = new Set(ids);
  return {
    books: BOOKS.filter((b) => set.has(b.id)).map((b) => b.id),
    best: passage?.book ?? ids[0] ?? null,
    passage,
  };
}

/** "Salmerne 23" / "Johannes 3,16" (Danish comma) — what Enter will open. */
export function placeLabel(p: NonNullable<PlaceFilter["passage"]>, locale: BookLocale): string {
  const sep = locale === "da" ? "," : ":";
  return `${bookName(p.book, locale)} ${p.chapter}${p.verse !== undefined ? `${sep}${p.verse}` : ""}`;
}
