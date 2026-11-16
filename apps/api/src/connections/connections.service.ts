import { Injectable } from '@nestjs/common';
import type { ChapterConnections } from '@biblestdy/shared';
import {
  anchorHere,
  idIsAbbr,
  notesTouchingChapter,
  refHere,
  type AbbrOf,
} from '../notes/chapter-scope';
import { toNote } from '../notes/notes.service';
import type { NoteStore } from '../notes/notes.store';
import type { TagStore } from '../tags/tags.store';

/**
 * The reader's Notes panel (issue #9, simplified in the notes plan): for one
 * chapter, the notes touching it — an anchor here in any translation or an
 * inline ref (#158) — each with ALL its anchors and refs (the row names its
 * other passages), and the topics they touch. Recent notes and "also
 * appears in" moved to the Notes page. Pure assembly over the NoteStore;
 * behavior-tested in-memory.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly store: NoteStore,
    private readonly tags: TagStore,
    /** Translation id → abbreviation, for the versification map (#163). */
    private readonly abbrOf: AbbrOf = idIsAbbr,
  ) {}

  async forChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<ChapterConnections> {
    const {
      rows: hereRows,
      anchors,
      refs,
      scope,
    } = await notesTouchingChapter(
      this.store,
      this.abbrOf,
      userId,
      translationId,
      book,
      chapter,
    );

    // Where a note first touches this chapter, as (verse, word): anchors in
    // any translation (words count only in the reading one — offsets differ
    // across translations), refs by verse; a ref from an earlier chapter or a
    // whole chapter sits at the top (#158). Verses in the reading
    // translation's numbering (#163)
    const firstHere = (noteId: string): [number, number] => {
      const keys: [number, number][] = [];
      for (const a of anchors) {
        if (a.noteId !== noteId) continue;
        const verse = anchorHere(a, scope);
        if (verse === null) continue;
        keys.push([verse, a.translationId === translationId ? a.startWord : 0]);
      }
      for (const r of refs) {
        if (r.noteId !== noteId) continue;
        const verse = refHere(r, scope);
        if (verse !== null) keys.push([verse, 0]);
      }
      keys.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      return keys[0] ?? [Infinity, 0];
    };

    // Notes here, in text order of where they first touch the chapter
    const notesHere = hereRows
      .map((row) => ({
        note: toNote(
          row,
          anchors.filter((a) => a.noteId === row.id),
          refs.filter((r) => r.noteId === row.id),
        ),
        first: firstHere(row.id),
      }))
      .sort((a, b) => a.first[0] - b.first[0] || a.first[1] - b.first[1])
      .map((x) => x.note);

    // Topics the chapter touches: its own tags plus tags of notes anchored here
    const passage = { translationId, book, chapter };
    const passageTags = await this.tags.tagsForPassage(userId, passage);
    const noteTags = await this.tags.tagsForNotes(hereRows.map((r) => r.id));
    const topics = new Map<
      string,
      { id: string; name: string; onPassage: boolean }
    >();
    for (const t of noteTags)
      topics.set(t.id, { id: t.id, name: t.name, onPassage: false });
    for (const t of passageTags)
      topics.set(t.id, { id: t.id, name: t.name, onPassage: true });

    return {
      notesHere,
      topics: [...topics.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
