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

/** The canon's own shape (#143, Ruth: "the shape of the canon is itself
 * teaching"): each testament's groups, by first book, canonical order. */
const CANON = [
  { testament: "old", groups: [["law", "GEN"], ["history", "JOS"], ["wisdom", "JOB"], ["prophets", "ISA"]] },
  { testament: "new", groups: [["gospels", "MAT"], ["acts", "ACT"], ["letters", "ROM"], ["revelation", "REV"]] },
] as const;

export type CanonGroup = { key: string; ids: string[] };
export type CanonTestament = { testament: "old" | "new"; groups: CanonGroup[] };

/** `ids` (canonical order, e.g. a filter's matches) in their testaments and
 * groups; empty groups and testaments are left out. */
export function canonGroups(ids: string[]): CanonTestament[] {
  const keep = new Set(ids);
  const firsts = new Map<string, string>(CANON.flatMap((t) => t.groups.map(([key, first]) => [first, key] as [string, string])));
  const out: CanonTestament[] = CANON.map((t) => ({ testament: t.testament, groups: [] }));
  let group: CanonGroup | null = null;
  for (const [i, b] of BOOKS.entries()) {
    const starts = firsts.get(b.id);
    if (starts) {
      group = { key: starts, ids: [] };
      out[i < 39 ? 0 : 1].groups.push(group);
    }
    if (keep.has(b.id)) group!.ids.push(b.id);
  }
  return out
    .map((t) => ({ ...t, groups: t.groups.filter((g) => g.ids.length > 0) }))
    .filter((t) => t.groups.length > 0);
}
