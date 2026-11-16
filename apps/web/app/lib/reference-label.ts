import type { BookLocale, Reference } from "@biblestdy/shared";

/** One psalm is "Salme 23" / "Psalm 23", the book "Salmerne" / "Psalms". */
const ONE_PSALM: Record<BookLocale, string> = { da: "Salme", en: "Psalm" };

/**
 * A reference in the UI language: "Johannes 3,16–18" / "John 3:16–18" (#130).
 * The one formatter for every surface that names a passage — the Notes page,
 * the reader, copy, the command palette. `bookName` gives the book in that
 * language (useBookName).
 */
export function referenceLabel(ref: Reference, bookName: (id: string) => string, locale: BookLocale): string {
  if (ref.chapter === undefined) return bookName(ref.book);
  const name = ref.book === "PSA" ? ONE_PSALM[locale] : bookName(ref.book);
  if (ref.verse === undefined) return `${name} ${ref.chapter}`;
  const sep = locale === "da" ? "," : ":";
  let out = `${name} ${ref.chapter}${sep}${ref.verse}`;
  if (ref.endVerse !== undefined && ref.endVerse !== ref.verse) {
    out += ref.endChapter !== undefined && ref.endChapter !== ref.chapter ? `–${ref.endChapter}${sep}${ref.endVerse}` : `–${ref.endVerse}`;
  }
  return out;
}
