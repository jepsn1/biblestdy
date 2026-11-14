import { Injectable } from '@nestjs/common';
import type { ChapterConnections } from '@biblestdy/shared';
import { toNote } from '../notes/notes.service';
import type { AnchorRow, NoteStore } from '../notes/notes.store';
import type { TagStore } from '../tags/tags.store';

/**
 * The reader's Notes panel (issue #9, simplified in the notes plan): for one
 * chapter, the notes anchored here (each with ALL its anchors — the row names
 * its other passages) and the topics they touch. Recent notes and "also
 * appears in" moved to the Notes page. Pure assembly over the NoteStore;
 * behavior-tested in-memory.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly store: NoteStore,
    private readonly tags: TagStore,
  ) {}

  async forChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<ChapterConnections> {
    const hereRows = await this.store.notesWithAnchorIn(
      userId,
      translationId,
      book,
      chapter,
    );
    const ids = hereRows.map((r) => r.id);
    const anchors = await this.store.anchorsFor(ids);
    const anchorsOf = (noteId: string) =>
      anchors.filter((a) => a.noteId === noteId);
    const inChapter = (a: AnchorRow) =>
      a.translationId === translationId &&
      a.book === book &&
      a.chapter === chapter;

    // Notes anchored here, in text order of their first anchor in this chapter
    const notesHere = hereRows
      .map((row) => {
        const own = anchorsOf(row.id);
        const first = own
          .filter(inChapter)
          .sort(
            (a, b) => a.startVerse - b.startVerse || a.startWord - b.startWord,
          )[0];
        return { note: toNote(row, own), first };
      })
      .sort(
        (a, b) =>
          a.first.startVerse - b.first.startVerse ||
          a.first.startWord - b.first.startWord,
      )
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
