/**
 * Where a note's reference sits from the reader's point of view (#214): the
 * references overview tags each row "this page", "p. 3" or "Rom 8".
 */

/** The reader beside the overview: the chapter open, the page showing, and
 * where a reference's spot (spotlight.ts) lands in it. */
export type RefLocator = {
  /** The open chapter, in the reading translation's own numbers. */
  book: string;
  chapter: number;
  /** The page showing (0-based); null: one long column (a phone). */
  page: number | null;
  /** A spot's page in the open chapter (null: one long column); undefined:
   * not placeable here (yet — notes or the versification map loading, or
   * in the verses the page before carried). */
  pageOf: (spot: string) => number | null | undefined;
};

export type RefTag = { kind: "thisPage" } | { kind: "page"; page: number } | { kind: "chapter"; book: string; chapter: number } | null;

/**
 * A row's tag. `at`: the reference's chapter in the reading translation
 * (null: not known yet). Nothing in the open chapter when it can't be
 * placed, nor on a phone's one long column (there is no page to name).
 */
export function refTag(locator: RefLocator | undefined, spot: string | null, at: { book: string; chapter: number } | null): RefTag {
  if (!locator || !at) return null;
  if (at.book !== locator.book || at.chapter !== locator.chapter) return { kind: "chapter", book: at.book, chapter: at.chapter };
  const page = spot ? locator.pageOf(spot) : undefined;
  if (page === undefined || page === null || locator.page === null) return null;
  return page === locator.page ? { kind: "thisPage" } : { kind: "page", page: page + 1 };
}

/** The foot's "1 more on p. 2 →" (#226): the open note's references on
 * another page of the chapter. `page`: the next page after this one that
 * has some (or, past the last, the first page back), 0-based; `count`: how
 * many land there; `back`: it lies behind this page. */
export type MoreRefs = { page: number; count: number; back: boolean };

/** From the pages the open note's references land on (null: not placed). */
export function moreRefs(pages: (number | null)[], current: number): MoreRefs | null {
  const placed = pages.filter((p): p is number => p !== null && p !== current);
  if (placed.length === 0) return null;
  const ahead = placed.filter((p) => p > current);
  const page = ahead.length > 0 ? Math.min(...ahead) : Math.min(...placed);
  return { page, count: placed.filter((p) => p === page).length, back: page < current };
}
