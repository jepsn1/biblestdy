import { resolveInChapter, type ChapterVerses } from "@biblestdy/shared";
import { mapRange, verseCount } from "@biblestdy/shared/versification";

/**
 * Where a translation switch lands (#174). The same verse carries other
 * numbers in other Bibles (WEB Mal 4:1 = BPH Mal 3,19; NIV Ps 51:1 = BPH
 * Salme 51,3), so the place is mapped through the versification map — never
 * kept by number. Lazy-loaded at switch time: the map stays out of /read's
 * first load.
 */

export interface Place {
  book: string;
  chapter: number;
  verse: number;
}

/** Why the landing isn't simply the same verse number:
 * - `renumbered`: the same verse, under another number here;
 * - `title`: a psalm title, which has no verse number here (lands on 1);
 * - `nearest`: this translation has no such verse; the nearest one instead. */
export type LandingNote = "renumbered" | "title" | "nearest";

export interface Landing extends Place {
  note: LandingNote | null;
}

/** `place` in `from`'s own numbering → the same text in `to`'s. */
export function switchLanding(place: Place, from: string, to: string): Landing {
  const map = (verse: number) => mapRange({ book: place.book, chapter: place.chapter, verse }, from, to)[0];
  const slice = map(place.verse);
  if (!slice) return { ...place, note: null };
  const at = (chapter: number, verse: number, note: LandingNote | null): Landing => ({
    book: place.book,
    chapter,
    verse: Math.max(1, verse),
    note,
  });
  switch (slice.kind) {
    case "same":
      return at(slice.chapter, slice.startVerse, null);
    case "renumbered":
    case "moved":
      return at(slice.chapter, slice.startVerse, "renumbered");
    case "psalmTitle":
      // BPH Salme 51,1–2 is the title: English has no number for it
      return slice.startVerse === 0 ? at(slice.chapter, 1, "title") : at(slice.chapter, slice.startVerse, "renumbered");
    case "unmapped": {
      // No counterpart (eng Neh 7:68): the nearest verse that has one,
      // looking back first, then on
      const last = verseCount(place.book, place.chapter, from);
      for (let d = 1; d <= Math.max(place.verse, last); d++) {
        for (const v of [place.verse - d, place.verse + d]) {
          if (v < 1 || v > last) continue;
          const near = map(v);
          if (near && near.kind !== "unmapped") return at(near.chapter, near.startVerse, "nearest");
        }
      }
      return at(place.chapter, 1, "nearest");
    }
  }
}

/** Once the chapter has loaded: a verse the map expects but this edition
 * leaves out (NIV has no Acts 8:37) lands on its neighbour (?v= snaps back),
 * so say so. */
export function checkLanding(landing: Landing, chapter: ChapterVerses): Landing {
  if (landing.note === "nearest") return landing;
  const hit = resolveInChapter({ book: landing.book, chapter: landing.chapter, verse: landing.verse }, chapter);
  return hit === "notInTranslation" ? { ...landing, note: "nearest" } : landing;
}
