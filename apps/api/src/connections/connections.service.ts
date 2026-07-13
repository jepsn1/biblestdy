import { Injectable } from '@nestjs/common';
import {
  compareReferences,
  type ChapterConnections,
  type PassageLink,
} from '@biblestdy/shared';
import { toNote } from '../notes/notes.service';
import type { AnchorRow, NoteStore } from '../notes/notes.store';
import type { TagStore } from '../tags/tags.store';

/** Recent notes shown as re-entry points — enough to resume, not a library. */
const RECENT_LIMIT = 5;

/**
 * The connections panel (issue #9): assembles, for one chapter, everything the
 * annotation graph knows around it — notes anchored here, passages connected
 * through those shared notes ("also appears in"), and the user's most recent
 * notes. Pure assembly over the NoteStore; behavior-tested in-memory.
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
    const recentRows = (await this.store.listNotes(userId)).slice(
      0,
      RECENT_LIMIT,
    );

    const ids = [...new Set([...hereRows, ...recentRows].map((r) => r.id))];
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

    // Other passages the chapter's notes also anchor to, grouped per passage
    const links = new Map<string, PassageLink>();
    for (const row of hereRows) {
      for (const a of anchorsOf(row.id)) {
        if (inChapter(a)) continue;
        const key = `${a.translationId}/${a.book}.${a.chapter}`;
        const link = links.get(key) ?? {
          translationId: a.translationId,
          book: a.book,
          chapter: a.chapter,
          notes: [],
        };
        if (!link.notes.some((n) => n.id === row.id)) {
          link.notes.push({ id: row.id, title: row.title });
        }
        links.set(key, link);
      }
    }
    const alsoAppearsIn = [...links.values()].sort((a, b) =>
      compareReferences(
        { book: a.book, chapter: a.chapter },
        { book: b.book, chapter: b.chapter },
      ),
    );

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
      alsoAppearsIn,
      recent: recentRows.map((row) => toNote(row, anchorsOf(row.id))),
      topics: [...topics.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
