import { TRANSLATION_INFO, type ScriptureRef } from '@biblestdy/shared';
import {
  CANONICAL,
  localRef,
  mapRange,
  numberingOf,
  refTouchesChapterIn,
  type NumberingLike,
} from '@biblestdy/shared/versification';
import { refOf } from './notes.service';
import type { AnchorRow, NoteRow, NoteStore, RefRow } from './notes.store';
import type { ScriptureProvider } from '../scripture/provider';

/**
 * Which notes a chapter of a translation lists (#163). note_ref rows are
 * canonical (English) numbering and anchors their own translation's, while
 * the chapter asked for is in the reading translation's: BPH Mal 3 must
 * list a note citing Mal 4:5 (BPH 3,23), BPH Joel 3 one citing Joel 2:30 —
 * and BPH Joel 2 must not. The store fetches candidates by chapter number,
 * the versification map decides.
 */

/** A translation id → its abbreviation (the versification key); undefined
 * = unknown, numbered the English way. */
export type AbbrOf = (translationId: string) => Promise<string | undefined>;

/** From the provider's (cached) translation list. A failed list numbers
 * the English way rather than failing the notes. */
export function abbrFromProvider(provider: ScriptureProvider): AbbrOf {
  return async (id) => {
    try {
      const list = await provider.listTranslations();
      return list.find((t) => t.id === id)?.abbreviation;
    } catch {
      return undefined;
    }
  };
}

/** Tests and fixtures use abbreviations as ids. */
export const idIsAbbr: AbbrOf = (id) => Promise.resolve(id);

/** Every chapter number, in any numbering we know, that shares a verse
 * with this chapter of `reading` — the store's candidate set. */
export function candidateChapters(
  reading: NumberingLike,
  book: string,
  chapter: number,
): number[] {
  const out = new Set([chapter]);
  const numberings = [
    CANONICAL,
    ...Object.keys(TRANSLATION_INFO).map(numberingOf),
  ];
  for (const n of numberings) {
    for (const s of mapRange({ book, chapter }, reading, n)) out.add(s.chapter);
  }
  return [...out].sort((a, b) => a - b);
}

function anchorRef(a: AnchorRow): ScriptureRef {
  const r: ScriptureRef = {
    book: a.book,
    chapter: a.chapter,
    verse: a.startVerse,
  };
  if (a.endVerse !== a.startVerse) r.endVerse = a.endVerse;
  return r;
}

/** The chapter as asked: its translation and how other ids number. */
export interface ChapterScope {
  translationId: string;
  abbr: string;
  book: string;
  chapter: number;
  /** Abbreviations of the anchors' translations, by id. */
  abbrs: Map<string, string>;
}

/** Where an anchor (its own numbering) lands in the scope's chapter: the
 * verse it starts at there, 0 when it starts in an earlier chapter, null
 * when it isn't here. */
export function anchorHere(a: AnchorRow, s: ChapterScope): number | null {
  if (a.book !== s.book) return null;
  if (a.translationId === s.translationId) {
    return a.chapter === s.chapter ? a.startVerse : null;
  }
  return placeHere(anchorRef(a), s, s.abbrs.get(a.translationId) ?? '');
}

/** The same for a stored (canonical) ref. */
export function refHere(r: RefRow, s: ChapterScope): number | null {
  return placeHere(refOf(r), s, CANONICAL);
}

function placeHere(
  ref: ScriptureRef,
  s: ChapterScope,
  from: NumberingLike,
): number | null {
  if (!refTouchesChapterIn(ref, s.abbr, s.book, s.chapter, from)) return null;
  const local = localRef(ref, s.abbr, from)?.ref ?? ref;
  return local.chapter === s.chapter ? (local.verse ?? 0) : 0;
}

/** The user's notes touching the chapter (by the map), with their anchors
 * and refs. */
export async function notesTouchingChapter(
  store: NoteStore,
  abbrOf: AbbrOf,
  userId: string,
  translationId: string,
  book: string,
  chapter: number,
): Promise<{
  rows: NoteRow[];
  anchors: AnchorRow[];
  refs: RefRow[];
  scope: ChapterScope;
}> {
  const abbr = (await abbrOf(translationId)) ?? '';
  const candidates = await store.notesInChapters(
    userId,
    book,
    candidateChapters(abbr, book, chapter),
  );
  const ids = candidates.map((r) => r.id);
  const [anchors, refs] = await Promise.all([
    store.anchorsFor(ids),
    store.refsFor(ids),
  ]);
  const abbrs = new Map<string, string>();
  for (const id of new Set(anchors.map((a) => a.translationId))) {
    abbrs.set(id, (await abbrOf(id)) ?? '');
  }
  const scope: ChapterScope = { translationId, abbr, book, chapter, abbrs };
  const here = new Set([
    ...anchors
      .filter((a) => anchorHere(a, scope) !== null)
      .map((a) => a.noteId),
    ...refs.filter((r) => refHere(r, scope) !== null).map((r) => r.noteId),
  ]);
  const rows = candidates.filter((r) => here.has(r.id));
  const keep = (x: { noteId: string }) => here.has(x.noteId);
  return {
    rows,
    anchors: anchors.filter(keep),
    refs: refs.filter(keep),
    scope,
  };
}
