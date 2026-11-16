import {
  refTouchesChapter,
  resolveInChapter,
  words,
  type Chapter,
  type Note,
  type NoteAnchor,
  type ScriptureRef,
} from "@biblestdy/shared";
import { noteTitle } from "../notes/note-list";

/**
 * Where the chapter's notes show in the text (#159). A note shows in every
 * translation: word-precise on its home translation (the words it was made
 * on), and at verse level everywhere else — an anchor from another
 * translation, or an inline `bible:` ref, marks the whole verse (or bridge)
 * it lands on, never mapped word for word. Pure; tested in
 * note-marks.test.ts.
 */

/** One drawn mark of a note in the current chapter. `verseLevel`: a whole
 * verse unit (another translation's anchor, or an inline ref) — its chip
 * sits by the verse, its words carry no ink and open nothing. */
export type NoteMark = NoteAnchor & { noteId: string; title: string; verseLevel?: boolean };

/** An anchor's verses as a translation-agnostic reference. */
function anchorRef(a: NoteAnchor): ScriptureRef {
  const ref: ScriptureRef = { book: a.book, chapter: a.chapter, verse: a.startVerse };
  if (a.endVerse !== a.startVerse) ref.endVerse = a.endVerse;
  return ref;
}

/** Whether a note touches the chapter: an anchor here in any translation,
 * or an inline ref covering it (what the API lists per chapter, #158). */
export function noteTouchesChapter(note: Note, book: string, chapter: number): boolean {
  return (
    note.anchors.some((a) => a.book === book && a.chapter === chapter) ||
    (note.refs ?? []).some((r) => refTouchesChapter(r, book, chapter))
  );
}

/** The translations (ids) a note's anchors here were written in, when none
 * is the one being read — the panel's "Written in WEB". Empty otherwise. */
export function writtenElsewhere(note: Note, translationId: string, book: string, chapter: number): string[] {
  const here = note.anchors.filter((a) => a.book === book && a.chapter === chapter);
  if (here.some((a) => a.translationId === translationId)) return [];
  return [...new Set(here.map((a) => a.translationId))];
}

/**
 * The chapter's note marks, per anchor and ref: a note anchored twice draws
 * two marks, each opening the same document. Home-translation anchors keep
 * their words; anything else resolves through the bridge resolver (BPH 3:15
 * → the "14–15" unit) to whole verses. A verse unit gets at most one mark
 * per note, and none where the note already marks words starting there.
 */
export function noteMarksInChapter(notes: Note[], chapter: Chapter): NoteMark[] {
  const { translationId, book } = chapter;
  const c = chapter.chapter;
  const wordCount = new Map(chapter.verses.map((v) => [v.verse, words(v.text).length]));
  return notes.flatMap((n) => {
    // Untitled notes go by their first line, as everywhere else
    const title = noteTitle(n, "");
    const home: NoteMark[] = n.anchors
      .filter((a) => a.translationId === translationId && a.book === book && a.chapter === c)
      .map((a) => ({ ...a, noteId: n.id, title }));
    const taken = new Set(home.map((m) => m.startVerse));
    const verseLevel: NoteMark[] = [];
    const place = (id: string, ref: ScriptureRef) => {
      const r = resolveInChapter(ref, chapter);
      if (r === null || r === "notInTranslation" || taken.has(r.startVerse)) return;
      taken.add(r.startVerse);
      verseLevel.push({
        id,
        noteId: n.id,
        title,
        translationId,
        book,
        chapter: c,
        startVerse: r.startVerse,
        startWord: 0,
        endVerse: r.endVerse,
        endWord: Math.max(0, (wordCount.get(r.endVerse) ?? 1) - 1),
        verseLevel: true,
      });
    };
    for (const a of n.anchors)
      if (a.translationId !== translationId && a.book === book && a.chapter === c) place(a.id, anchorRef(a));
    for (const r of n.refs ?? []) place(r.id, r);
    return [...home, ...verseLevel];
  });
}
