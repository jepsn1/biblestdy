import { bookName, DANISH_BOOKS, type BookId, type BookLocale, type Reference } from "@biblestdy/shared";

/** One psalm is "Salme 23" / "Psalm 23", the book "Salmerne" / "Psalms". */
const ONE_PSALM: Record<BookLocale, string> = { da: "Salme", en: "Psalm" };

/** "<name> 3,16–18": the numbers of a reference after a book name. */
function withNumbers(name: string, ref: Reference, locale: BookLocale): string {
  if (ref.chapter === undefined) return name;
  if (ref.verse === undefined) return `${name} ${ref.chapter}`;
  const sep = locale === "da" ? "," : ":";
  let out = `${name} ${ref.chapter}${sep}${ref.verse}`;
  if (ref.endVerse !== undefined && ref.endVerse !== ref.verse) {
    out += ref.endChapter !== undefined && ref.endChapter !== ref.chapter ? `–${ref.endChapter}${sep}${ref.endVerse}` : `–${ref.endVerse}`;
  }
  return out;
}

/**
 * A reference in the UI language: "Johannes 3,16–18" / "John 3:16–18" (#130).
 * The one formatter for every surface that names a passage — the Notes page,
 * the reader, copy, the command palette. `bookName` gives the book in that
 * language (useBookName).
 */
export function referenceLabel(ref: Reference, bookName: (id: string) => string, locale: BookLocale): string {
  if (ref.chapter === undefined) return bookName(ref.book);
  return withNumbers(ref.book === "PSA" ? ONE_PSALM[locale] : bookName(ref.book), ref, locale);
}

/** A book's short name for an inline reference chip (#160): Danish uses the
 * Bibelselskabet abbreviation ("Joh", "1 Mos", "Sl", "Åb"); a book without
 * a one-word one ("Job", "Joel") keeps its name. English keeps the name
 * ("John"; "Psalm" for the Psalms). */
export function shortBookName(id: string, locale: BookLocale): string {
  if (locale === "en") return id === "PSA" ? ONE_PSALM.en : bookName(id, "en");
  const names = DANISH_BOOKS[id as BookId];
  if (!names) return bookName(id, "da");
  const [display, abbr] = names;
  if (!abbr || abbr.length >= display.length || !/^(\d )?\p{L}+$/u.test(abbr)) return display;
  return abbr.replace(/\p{L}/u, (c) => c.toUpperCase());
}

/**
 * The label an inline reference chip shows (#160): short book, the UI
 * language's separator, an en dash in ranges and no-break spaces, so it never
 * breaks across lines: "Joh 3,16" / "John 3:16", "Es 52,13–53,12".
 */
export function chipLabel(ref: Reference, locale: BookLocale): string {
  return withNumbers(shortBookName(ref.book, locale), ref, locale).replace(/ /g, " ");
}
